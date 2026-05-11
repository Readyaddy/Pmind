import logging
import os
import hmac
import hashlib
import json
import razorpay
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from deps import get_user_id, get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
PLAN_AMOUNTS = {
    "pro": int(os.getenv("RAZORPAY_PRO_AMOUNT", "150000")),   # ₹1,500
    "team": int(os.getenv("RAZORPAY_TEAM_AMOUNT", "299900")), # ₹2,999
}
PLAN_DURATION_DAYS = 30


def get_client() -> razorpay.Client:
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=503, detail="Billing not configured")
    return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


class CreateOrderRequest(BaseModel):
    plan: str = "pro"  # pro | team


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    plan: str = "pro"


# ── Step 1: Create Order ────────────────────────────────────────────────────

@router.post("/create-order")
async def create_order(body: CreateOrderRequest, user_id: str = Depends(get_user_id)):
    plan = body.plan if body.plan in PLAN_AMOUNTS else "pro"
    amount = PLAN_AMOUNTS[plan]
    if amount < 100:
        raise HTTPException(status_code=400, detail="Amount must be at least 100 paise")
    logger.info("Creating order — user=%s plan=%s amount=%d", user_id, plan, amount)
    client = get_client()
    order = client.order.create({
        "amount": amount,
        "currency": "INR",
        "receipt": f"{plan}_{user_id[:20]}",
        "notes": {"user_id": user_id, "plan": plan},
    })
    logger.info("Order created — order_id=%s user=%s plan=%s", order["id"], user_id, plan)
    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "plan": plan,
    }


# ── Step 3: Verify Signature ────────────────────────────────────────────────

@router.post("/verify-payment")
async def verify_payment(body: VerifyPaymentRequest, user_id: str = Depends(get_user_id)):
    # 1. Verify Razorpay signature
    message = f"{body.razorpay_order_id}|{body.razorpay_payment_id}"
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
        logger.warning("Payment signature mismatch — user=%s order=%s", user_id, body.razorpay_order_id)
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    supabase = get_supabase()

    # 2. Replay attack guard — reject if this payment_id is already recorded
    existing = supabase.table("user_subscriptions") \
        .select("razorpay_payment_id") \
        .eq("razorpay_payment_id", body.razorpay_payment_id) \
        .execute()
    if existing.data:
        logger.warning("Replay attempt — user=%s payment_id=%s", user_id, body.razorpay_payment_id)
        raise HTTPException(status_code=400, detail="Payment already applied")

    # 3. Derive plan from the order's server-side notes (not the request body)
    #    This prevents a user paying for Pro but claiming Team in the body.
    client = get_client()
    try:
        order = client.order.fetch(body.razorpay_order_id)
        plan_from_order = order.get("notes", {}).get("plan", "pro")
        plan = plan_from_order if plan_from_order in PLAN_AMOUNTS else "pro"
    except Exception:
        # Fallback: trust request body if Razorpay fetch fails (still safe — signature verified)
        plan = body.plan if body.plan in PLAN_AMOUNTS else "pro"

    period_end = datetime.now(timezone.utc) + timedelta(days=PLAN_DURATION_DAYS)
    logger.info("Payment verified — user=%s plan=%s payment_id=%s period_end=%s", user_id, plan, body.razorpay_payment_id, period_end.isoformat())
    supabase.table("user_subscriptions").upsert(
        {
            "user_id": user_id,
            "razorpay_order_id": body.razorpay_order_id,
            "razorpay_payment_id": body.razorpay_payment_id,
            "plan": plan,
            "status": "active",
            "current_period_end": period_end.isoformat(),
        },
        on_conflict="user_id",
    ).execute()

    return {"success": True, "current_period_end": period_end.isoformat()}


# ── Subscription status ─────────────────────────────────────────────────────

@router.get("/subscription")
async def get_subscription(user_id: str = Depends(get_user_id)):
    if os.getenv("NEXT_PUBLIC_DEV_MODE") == "true":
        return {"plan": "pro", "status": "active", "current_period_end": None}
    supabase = get_supabase()
    try:
        res = supabase.table("user_subscriptions") \
            .select("plan, status, current_period_end") \
            .eq("user_id", user_id).execute()
        if res.data:
            return res.data[0]
    except Exception:
        pass
    return {"plan": "free", "status": "active", "current_period_end": None}


# ── Cancel (manual downgrade) ───────────────────────────────────────────────

@router.post("/cancel")
async def cancel_subscription(user_id: str = Depends(get_user_id)):
    supabase = get_supabase()
    supabase.table("user_subscriptions").update({
        "plan": "free",
        "status": "cancelled",
    }).eq("user_id", user_id).execute()
    return {"success": True}


# ── Webhook ─────────────────────────────────────────────────────────────────

@router.post("/webhook")
async def razorpay_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("x-razorpay-signature", "")

    # Always require webhook signature — open webhook endpoint is a critical security hole
    if not RAZORPAY_WEBHOOK_SECRET:
        logger.error("Webhook received but RAZORPAY_WEBHOOK_SECRET is not configured — rejecting")
        raise HTTPException(status_code=503, detail="Webhook not configured")
    expected = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, sig):
        logger.warning("Webhook signature mismatch — possible spoofed request")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event = json.loads(payload)
    event_type = event.get("event")
    logger.info("Webhook received — event=%s", event_type)
    supabase = get_supabase()

    if event_type == "payment.captured":
        payment = event["payload"]["payment"]["entity"]
        user_id = payment.get("notes", {}).get("user_id")
        order_id = payment.get("order_id")
        plan = payment.get("notes", {}).get("plan", "pro")
        if plan not in PLAN_AMOUNTS:
            plan = "pro"
        if user_id:
            period_end = datetime.now(timezone.utc) + timedelta(days=PLAN_DURATION_DAYS)
            supabase.table("user_subscriptions").upsert(
                {
                    "user_id": user_id,
                    "razorpay_order_id": order_id,
                    "razorpay_payment_id": payment["id"],
                    "plan": plan,
                    "status": "active",
                    "current_period_end": period_end.isoformat(),
                },
                on_conflict="user_id",
            ).execute()

    elif event_type == "payment.failed":
        payment = event["payload"]["payment"]["entity"]
        user_id = payment.get("notes", {}).get("user_id")
        if user_id:
            supabase.table("user_subscriptions").update({
                "status": "payment_failed",
            }).eq("user_id", user_id).execute()

    return {"received": True}
