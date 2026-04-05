import os
import joblib
import numpy as np
from flask import Flask, request, jsonify

app = Flask(__name__)

# --- Configuration ---
BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, 'allocation_model.pkl')

# Global model variable
model = None

def load_model():
    global model
    if os.path.exists(MODEL_PATH):
        try:
            model = joblib.load(MODEL_PATH)
            print(f"Model loaded successfully from {MODEL_PATH}")
        except Exception as e:
            print(f"Error loading model: {e}")
            model = None
    else:
        print(f"Warning: Model file {MODEL_PATH} not found. Start training first.")
        model = None

@app.route('/predict', methods=['POST'])
def predict():
    if model is None:
        return jsonify({'error': 'Allocation model not found on server.'}), 503

    try:
        data = request.get_json(force=True)
        
        # Expected keys match standardized schema
        feature_keys = [
            'file_size', 'free_block_ratio', 'external_fragmentation', 
            'internal_fragmentation', 'avg_seek_distance', 
            'creation_rate', 'deletion_rate', 'disk_utilization'
        ]
        
        # Extract features (handle both snake_case and potentially camelCase if needed,
        # but the instruction implies standardization to these exact names)
        # We'll use get(k, 0) as a fallback
        features = []
        for k in feature_keys:
            val = data.get(k)
            if val is None:
                # Fallback for camelCase just in case frontend hasn't updated
                camel_k = k.replace('_', ' ').title().replace(' ', '')
                camel_k = camel_k[0].lower() + camel_k[1:]
                val = data.get(camel_k, 0)
            features.append(float(val))
            
        features_array = np.array([features])
        
        # Get prediction and probabilities
        prediction = model.predict(features_array)[0]
        probs = model.predict_proba(features_array)[0]
        highest_probability = float(np.max(probs))
        
        return jsonify({
            "strategy": prediction,
            "probability": highest_probability
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok' if model is not None else 'model_missing',
        'model_loaded': model is not None
    })

if __name__ == '__main__':
    load_model()
    # Running on 5000 by default
    app.run(host='0.0.0.0', port=5000, debug=False)
