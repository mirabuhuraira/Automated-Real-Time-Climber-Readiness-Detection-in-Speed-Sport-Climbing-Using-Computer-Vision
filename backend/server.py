import uvicorn
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from ai_model import AI_Model

@asynccontextmanager
async def lifespan(app: FastAPI):
    # This runs when the server starts
    app.state.model = AI_Model()
    app.state.model.load_model()
    yield
    # Cleanup logic can go here if needed

app = FastAPI(title="Climber Safety API", lifespan=lifespan)

# Essential for React Integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "online", "models_loaded": app.state.model.person_model is not None}

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    try:
        # 1. Read the uploaded file into memory
        file_bytes = await file.read()
        nparr = np.frombuffer(file_bytes, np.uint8)
        
        # 2. Convert to OpenCV format
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            raise HTTPException(status_code=400, detail="Invalid Image Data")

        # 3. Process with AI
        analysis_result = app.state.model.run_inference(frame)
        return analysis_result

    except Exception as e:
        print(f"SERVER ERROR: {e}")
        return {"status": "Error", "message": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)