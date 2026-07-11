from fastapi import FastAPI

app = FastAPI(
    title="UniSwap AI API",
    version="1.0.0"
)

@app.get("/")
def home():
    return {
        "message": "Welcome to UniSwap AI Backend"
    }