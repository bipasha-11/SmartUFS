
# ML-Based Allocation Strategy Selector Implementation

This document describes the changes made to the UNIX File System Simulator to integrate a Machine Learning module for dynamic allocation strategy switching.

## 1. Architecture Changes

The system now operates in a **Hybrid Mode**:
- **Simulator (Node.js/TypeScript)**: Handles file system operations, metric collection, and strategy enforcement.
- **ML Service (Python)**: Handles model training and real-time prediction.

### Integration Flow
1. **Feature Extraction**: `DiskManager` uses `MetricsCollector` to track system state (avg file size, fragmentation, etc.).
2. **Monitoring**: `DiskManager` polls the Python `Predictor` service every 5 seconds (configurable).
3. **Prediction**: Python service runs the trained Decision Tree model and returns the optimal strategy.
4. **Switching**: `DiskManager` dynamically hot-swaps the allocation strategy.

## 2. New Components

| Component | Path | Description |
|-----------|------|-------------|
| **Metrics Collector** | `backend/src/ml/MetricsCollector.ts` | Extracts 6 key features (R/W ratio, throughput, etc.). |
| **Dataset Generator** | `backend/src/ml/generate_dataset.ts` | Runs simulations to generate labeled training data (`dataset.csv`). |
| **Simulated Strategies**| `backend/src/strategies/` | Added `IndexedAllocator` and `Ext2Allocator` for completeness. |
| **Trainer** | `backend/ml_module/train_model.py` | Python script to train Decision Tree classifier. |
| **Predictor** | `backend/ml_module/predictor.py` | Flask API serving the model. |

## 3. Usage Instructions

### Prerequisites
- Node.js (v14+ recommended for `ts-node` data generation)
- Python 3.8+
- Dependencies: `pip install -r backend/ml_module/requirements.txt`

### Step 1: Generate Training Data
Run the simulator in "Training Mode" to generate a dataset.
```bash
cd "d:/OS Project"
npx ts-node backend/src/ml/generate_dataset.ts
```
*Output: `dataset.csv`*

### Step 2: Train the Model
Train the Decision Tree model using the generated data.
```bash
python backend/ml_module/train_model.py
```
*Output: `allocation_model.pkl`*

### Step 3: Start the ML Service
Run the Python prediction API.
```bash
python backend/ml_module/predictor.py
```
*Starts server at http://localhost:5000*

### Step 4: Run the Simulator
Start your backend as usual.
```bash
# In backend directory
npm start
```

### Step 5: Enable ML Mode
By default, ML mode is disabled. To enable it, send a POST request:
```bash
curl -X POST http://localhost:3001/api/ml -H "Content-Type: application/json" -d '{"enabled": true}'
```
Or use the frontend to call this endpoint.

## 4. Verification
- **Logs**: Check backend console for `ML Switching Strategy to: ...`.
- **API**: GET `/api/state` now includes `metrics` and `mlEnabled`.

## 5. Files Changed
- `backend/src/managers/DiskManager.ts`: Added metrics integration and polling loop.
- `backend/src/index.ts`: Added `/api/ml` and `/api/files/read` endpoints.
- `backend/src/strategies/index.ts`: Exported new strategies.
