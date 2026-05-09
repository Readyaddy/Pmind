import os
import hmac
import hashlib
import json
import razorpay
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
from deps import get_user_id, get_supabase

router = APIRouter()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
PLAN_AMOUNTS = {
    "pro": int(os.getenv("RAZORPAY_PRO_AMOUNT", "99900")),    # ₹999
    "team": int(os.getenv("RAZORPAY_TEAM_AMOUNT", "299900")), # ₹2,999
}


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
    client = get_client()
    order = client.order.create({
        "amount": amount,
        "currency": "INR",
        "receipt": f"{plan}_{user_id[:20]}",
        "notes": {"user_id": user_id, "plan": plan},
    })
    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "plan": plan,
    }


# ── Step 3: Verify Signature ────────────────────────────────────────────────

@router.post("/verify-payment")
async def verify_payment(body: VerifyPaymentRequest, user_id: str = Depends(get_user_id)):
    message = f"{body.razorpay_order_id}|{body.razorpay_payment_id}"
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    plan = body.plan if body.plan in PLAN_AMOUNTS else "pro"
    supabase = get_supabase()
    supabase.table("user_subscriptions").upsert(
        {
            "user_id": user_id,
            "razorpay_order_id": body.razorpay_order_id,
            "razorpay_payment_id": body.razorpay_payment_id,
            "plan": plan,
            "status": "active",
        },
        on_conflict="user_id",
    ).execute()

    return {"success": True}


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

    if RAZORPAY_WEBHOOK_SECRET:
        expected = hmac.new(
            RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, sig):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event = json.loads(payload)
    event_type = event.get("event")
    supabase = get_supabase()

    if event_type == "payment.captured":
        payment = event["payload"]["payment"]["entity"]
        user_id = payment.get("notes", {}).get("user_id")
        order_id = payment.get("order_id")
        if user_id:
            supabase.table("user_subscriptions").upsert(
                {
                    "user_id": user_id,
                    "razorpay_order_id": order_id,
                    "razorpay_payment_id": payment["id"],
                    "plan": "pro",
                    "status": "active",
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
