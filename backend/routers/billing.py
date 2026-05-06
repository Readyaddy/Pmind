import os
import stripe
from fastapi import APIRouter, Request, HTTPException, Depends
from deps import get_user_id, get_supabase

router = APIRouter()
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


@router.post("/checkout")
async def create_checkout(user_id: str = Depends(get_user_id)):
    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Billing not configured")
    supabase = get_supabase()
    sub_res = supabase.table("user_subscriptions").select("stripe_customer_id").eq("user_id", user_id).execute()
    customer_id = sub_res.data[0].get("stripe_customer_id") if sub_res.data else None

    if not customer_id:
        customer = stripe.Customer.create(metadata={"user_id": user_id})
        customer_id = customer.id
        supabase.table("user_subscriptions").upsert(
            {"user_id": user_id, "stripe_customer_id": customer_id, "plan": "free", "status": "active"},
            on_conflict="user_id"
        ).execute()

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        payment_method_types=["card"],
        line_items=[{"price": os.getenv("STRIPE_PRO_PRICE_ID", ""), "quantity": 1}],
        success_url=f"{FRONTEND_URL}/billing?success=1",
        cancel_url=f"{FRONTEND_URL}/billing?canceled=1",
    )
    return {"url": session.url}


@router.post("/portal")
async def create_portal(user_id: str = Depends(get_user_id)):
    if not stripe.api_key:
        raise HTTPException(status_code=503, detail="Billing not configured")
    supabase = get_supabase()
    sub_res = supabase.table("user_subscriptions").select("stripe_customer_id").eq("user_id", user_id).execute()
    if not sub_res.data or not sub_res.data[0].get("stripe_customer_id"):
        raise HTTPException(status_code=400, detail="No Stripe customer found")
    session = stripe.billing_portal.Session.create(
        customer=sub_res.data[0]["stripe_customer_id"],
        return_url=f"{FRONTEND_URL}/billing",
    )
    return {"url": session.url}


@router.get("/subscription")
async def get_subscription(user_id: str = Depends(get_user_id)):
    # Dev mode: always report pro so no features are gated during development
    if os.getenv("NEXT_PUBLIC_DEV_MODE") == "true":
        return {"plan": "pro", "status": "active", "current_period_end": None}
    supabase = get_supabase()
    try:
        res = supabase.table("user_subscriptions").select("plan, status, current_period_end").eq("user_id", user_id).execute()
        if res.data:
            return res.data[0]
    except Exception:
        pass
    return {"plan": "free", "status": "active", "current_period_end": None}


@router.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    supabase = get_supabase()

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        customer_id = session["customer"]
        subscription_id = session["subscription"]
        sub = stripe.Subscription.retrieve(subscription_id)
        supabase.table("user_subscriptions").update({
            "stripe_subscription_id": subscription_id,
            "plan": "pro",
            "status": "active",
            "current_period_end": sub["current_period_end"],
        }).eq("stripe_customer_id", customer_id).execute()

    elif event["type"] == "customer.subscription.deleted":
        subscription = event["data"]["object"]
        supabase.table("user_subscriptions").update({
            "plan": "free",
            "status": "inactive",
            "stripe_subscription_id": None,
        }).eq("stripe_customer_id", subscription["customer"]).execute()

    return {"received": True}
