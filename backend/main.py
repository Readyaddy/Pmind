from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import ai, documents, projects, folders, knowledge, integrations, context, billing, templates

app = FastAPI(title="PM Cursor API")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Thread-Id"],
)

app.include_router(projects.router, prefix="/projects", tags=["Projects"])
app.include_router(documents.router, prefix="/documents", tags=["Documents"])
app.include_router(folders.router, prefix="/folders", tags=["Folders"])
app.include_router(ai.router, prefix="/ai", tags=["AI"])
app.include_router(knowledge.router, prefix="/knowledge", tags=["Knowledge"])
app.include_router(integrations.router, prefix="/integrations", tags=["Integrations"])
app.include_router(context.router, prefix="/context", tags=["Context"])
app.include_router(billing.router, prefix="/billing", tags=["Billing"])
app.include_router(templates.router, prefix="/templates", tags=["Templates"])


@app.get("/health")
def health():
    return {"status": "ok"}
