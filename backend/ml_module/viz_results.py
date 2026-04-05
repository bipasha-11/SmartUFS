
import json
import os
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import joblib

# Set style
plt.style.use('seaborn-v0_8-muted')
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['Arial', 'DejaVu Sans']

BASE_DIR = os.path.dirname(__file__)
REPORT_PATH = os.path.join(BASE_DIR, 'evaluation_report.json')
GRAPHS_DIR = os.path.join(BASE_DIR, 'graphs')
MODEL_PATH = os.path.join(BASE_DIR, 'allocation_model.pkl')

if not os.path.exists(GRAPHS_DIR):
    os.makedirs(GRAPHS_DIR)

def generate_graphs():
    if not os.path.exists(REPORT_PATH):
        print(f"Error: {REPORT_PATH} not found. Run evaluate.py first.")
        return

    with open(REPORT_PATH, 'r') as f:
        data = json.load(f)

    results = data['results']
    modes = list(results.keys())
    
    # 1. Performance Metrics Comparison
    metrics = ['success_rate', 'avg_fragmentation', 'avg_seek_distance']
    labels = [m.replace('_', ' ').title() for m in modes]
    
    fig, axes = plt.subplots(1, 3, figsize=(18, 6))
    colors = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2']

    for i, metric in enumerate(metrics):
        values = [results[m][metric] for m in modes]
        axes[i].bar(labels, values, color=colors)
        axes[i].set_title(metric.replace('_', ' ').title(), fontsize=14, fontweight='bold')
        axes[i].set_ylabel('Value')
        axes[i].tick_params(axis='x', rotation=45)
        
        # Add values on top of bars
        for j, v in enumerate(values):
            axes[i].text(j, v + (max(values)*0.01), f'{v:.3f}', ha='center', fontweight='bold')

    plt.tight_layout()
    plt.savefig(os.path.join(GRAPHS_DIR, 'performance_metrics.png'), dpi=300)
    print(f"Saved: performance_metrics.png")

    # 2. Strategy Distribution for ML-Advised
    if 'ml_advised' in results:
        dist = results['ml_advised']['strategy_distribution']
        strategy_labels = list(dist.keys())
        strategy_values = list(dist.values())
        
        plt.figure(figsize=(10, 7))
        plt.pie(strategy_values, labels=strategy_labels, autopct='%1.1f%%', 
                startangle=140, colors=plt.cm.Paired(np.linspace(0, 1, len(strategy_labels))),
                explode=[0.05] * len(strategy_labels), shadow=True)
        plt.title('ML-Advised Strategy Selection Distribution', fontsize=16, fontweight='bold')
        plt.savefig(os.path.join(GRAPHS_DIR, 'ml_strategy_distribution.png'), dpi=300)
        print(f"Saved: ml_strategy_distribution.png")

    # 3. Feature Importance
    if os.path.exists(MODEL_PATH):
        try:
            model = joblib.load(MODEL_PATH)
            feature_cols = [
                'file_size', 'free_block_ratio', 'external_fragmentation',
                'internal_fragmentation', 'avg_seek_distance', 'creation_rate',
                'deletion_rate', 'disk_utilization'
            ]
            
            importances = model.feature_importances_
            feat_df = pd.DataFrame({'Feature': feature_cols, 'Importance': importances})
            feat_df = feat_df.sort_values(by='Importance', ascending=True)

            plt.figure(figsize=(10, 8))
            plt.barh(feat_df['Feature'], feat_df['Importance'], color='#59a14f')
            plt.title('ML Model Feature Importance', fontsize=16, fontweight='bold')
            plt.xlabel('Importance Score')
            plt.tight_layout()
            plt.savefig(os.path.join(GRAPHS_DIR, 'feature_importance.png'), dpi=300)
            print(f"Saved: feature_importance.png")
        except Exception as e:
            print(f"Could not generate feature importance: {e}")

    # 4. Comparison across operations (if we had data from multiple runs)
    # Since we only have one run, we'll create a summary dashboard
    plt.figure(figsize=(12, 8))
    
    # Comparison of Fragmentation (Primary Goal)
    frag_values = [results[m]['avg_fragmentation'] for m in modes]
    plt.bar(labels, frag_values, color=['#A0CBE8', '#F28E2B', '#E15759', '#76B7B2'])
    plt.title('Comparison of External Fragmentation (Lower is Better)', fontsize=16, fontweight='bold')
    plt.ylabel('Fragmentation Ratio')
    plt.grid(axis='y', linestyle='--', alpha=0.7)
    plt.savefig(os.path.join(GRAPHS_DIR, 'fragmentation_comparison.png'), dpi=300)
    print(f"Saved: fragmentation_comparison.png")

if __name__ == "__main__":
    generate_graphs()
