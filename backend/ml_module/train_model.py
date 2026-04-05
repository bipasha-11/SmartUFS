import pandas as pd
import numpy as np
import os
import joblib
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report

# --- Configuration ---
BASE_DIR = os.path.dirname(__file__)
DATASET_PATH = os.path.join(BASE_DIR, 'dataset.csv')
MODEL_PATH = os.path.join(BASE_DIR, 'allocation_model.pkl')

def train():
    if not os.path.exists(DATASET_PATH):
        print(f"Error: {DATASET_PATH} not found. Run generate_dataset.py first.")
        return

    # 1. Load Dataset
    print(f"Loading dataset from {DATASET_PATH}...")
    df = pd.read_csv(DATASET_PATH)
    
    # Check if we have data
    if df.empty:
        print("Error: Dataset is empty.")
        return

    # 2. Prepare Features and Target
    # EXACT column names as per Step 1
    feature_cols = [
        'file_size',
        'free_block_ratio',
        'external_fragmentation',
        'internal_fragmentation',
        'avg_seek_distance',
        'creation_rate',
        'deletion_rate',
        'disk_utilization'
    ]
    
    X = df[feature_cols]
    y = df['best_strategy']
    
    # 3. Split into Train and Test sets
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print(f"Training set: {len(X_train)} samples")
    print(f"Testing set: {len(X_test)} samples\n")
    
    # 4. Train Decision Tree
    print("Training Decision Tree...")
    dt_clf = DecisionTreeClassifier(random_state=42)
    dt_clf.fit(X_train, y_train)
    dt_pred = dt_clf.predict(X_test)
    dt_acc = accuracy_score(y_test, dt_pred)
    
    print(f"Decision Tree Accuracy: {dt_acc:.4f}")
    print("Confusion Matrix (DT):")
    print(confusion_matrix(y_test, dt_pred))
    print("\n" + "="*30 + "\n")
    
    # 5. Train Random Forest
    print("Training Random Forest...")
    rf_clf = RandomForestClassifier(n_estimators=100, random_state=42)
    rf_clf.fit(X_train, y_train)
    rf_pred = rf_clf.predict(X_test)
    rf_acc = accuracy_score(y_test, rf_pred)
    
    print(f"Random Forest Accuracy: {rf_acc:.4f}")
    print("Confusion Matrix (RF):")
    print(confusion_matrix(y_test, rf_pred))
    print("\n" + "="*30 + "\n")
    
    # 6. Select and Save the best model
    if rf_acc >= dt_acc:
        best_model = rf_clf
        model_name = "Random Forest"
    else:
        best_model = dt_clf
        model_name = "Decision Tree"
        
    print(f"Saving {model_name} as the production model to {MODEL_PATH}...")
    joblib.dump(best_model, MODEL_PATH)
    print("Successfully saved model.")

    # 7. Print Feature Importance (using the best model)
    print("\nFeature Importances:")
    importances = best_model.feature_importances_
    for name, importance in zip(X.columns, importances):
        print(f"{name}: {importance:.4f}")

if __name__ == "__main__":
    train()
