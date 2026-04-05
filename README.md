# OS Project: ML-Enhanced File System Simulator

This project is a comprehensive simulation of a file system (EXT2-inspired) enhanced with a Machine Learning (ML) advisory layer for dynamic allocation strategy selection.

## 🚀 How to Run the Project

### 1. Prerequisites
- **Node.js** (v14+)
- **Python 3.13**
- **PowerShell** (for the automated startup script)

### 2. Quick Start (Windows)
Run the following script from the project root:
```powershell
./run_all.ps1
```
This will start:
- **ML Service**: Python/Flask (Port 5000)
- **Backend API**: Node.js/TypeScript (Port 3001)
- **Frontend Dashboard**: React/Vite (Port 3000)

### 3. Manual Steps
If you prefer running components separately:
- **ML Service**: `python backend/ml_module/predictor.py`
- **Backend**: `cd backend && npx ts-node src/index.ts`
- **Frontend**: `cd frontend && npm run dev`

---

## 🏗️ Architecture Overview

The system follows a hybrid architecture combining real-time OS simulation with predictive modeling:

1. **Frontend (React)**:
   - Real-time visualization of the 100-block disk map.
   - Interactive control panel for file allocation and strategy selection.
   - ML Advisory dashboard with confidence metrics and decision logs.

2. **Backend (TypeScript/Express)**:
   - Core file system logic (Inodes, Block management).
   - Multiple allocation strategies: Contiguous, Linked, Indexed, and EXT2-like.
   - **ML Advisory Layer**: Intercepts allocation requests, extracts disk features, and consults the ML service for the optimal strategy.

3. **ML Module (Python/Flask)**:
   - **Random Forest Model**: Trained on simulation data to predict the best strategy based on fragmentation, seek distance, and utilization.
   - **Data Pipeline**: Tools for dataset generation (`generate_dataset.py`) and model training (`train_model.py`).

---

## 📊 Key Features Implemented

- [x] **Dynamic Strategy Switching**: The system can hot-swap allocation logic at runtime based on ML predictions.
- [x] **Feature Extraction**: 8-dimension feature vector captured from the disk state for every allocation.
- [x] **Benchmark Framework**: Automated comparison between static strategies and the ML-advised approach.
- [x] **Performance Metrics**: Real-time tracking of external fragmentation, average seek distance, and throughput.

---

## 💾 Saved State
The project has been stabilized with the following fixes:
- **Fixed ML Connectivity**: Updated internal URLs to use `127.0.0.1` for reliable resolution.
- **Cleaned Backend**: Removed redundant JS files to ensure the TypeScript source remains the source of truth.
- **Model Ready**: The `allocation_model.pkl` is trained and ready for immediate use.
