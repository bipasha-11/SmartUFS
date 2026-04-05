
import json
import os
import sys
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
import pandas as pd
import joblib
from matplotlib.gridspec import GridSpec

# Set premium styling
sns.set_theme(style="whitegrid", palette="muted")
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['Inter', 'Outfit', 'Segoe UI', 'DejaVu Sans']
plt.rcParams['figure.dpi'] = 300

# Color palette for strategies
STRATEGY_COLORS = {
    "static_ext2": "#4e79a7",
    "static_contiguous": "#f28e2b",
    "static_linked": "#e15759",
    "ml_advised": "#76b7b2",
    "Contiguous": "#59a14f",
    "Linked": "#edc948",
    "Indexed": "#b07aa1",
    "Ext2": "#ff9da7"
}

def generate_premium_graphs(json_path, output_dir):
    if not os.path.exists(json_path):
        print(f"Error: {json_path} not found.")
        return

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    with open(json_path, 'r') as f:
        data = json.load(f)

    results = data['results']
    modes = list(results.keys())
    
    # Prepare DataFrames for Seaborn
    perf_data = []
    for mode, metrics in results.items():
        perf_data.append({
            "Strategy": mode.replace('_', ' ').title(),
            "Success Rate (%)": metrics['success_rate'] * 100,
            "Fragmentation Ratio": metrics['avg_fragmentation'],
            "Seek Distance (norm)": metrics['avg_seek_distance'],
            "Disk Utilization (%)": metrics['avg_utilization'] * 100
        })
    df_perf = pd.DataFrame(perf_data)

    # 1. Comparative Performance Bar Chart (The Big Three)
    fig, axes = plt.subplots(1, 3, figsize=(20, 7))
    metrics_to_plot = ["Fragmentation Ratio", "Seek Distance (norm)", "Success Rate (%)"]
    titles = ["External Fragmentation\n(Lower is Better)", "Avg Seek Distance\n(Lower is Better)", "Allocation Success Rate\n(Higher is Better)"]
    
    for i, metric in enumerate(metrics_to_plot):
        sns.barplot(data=df_perf, x="Strategy", y=metric, ax=axes[i], palette="viridis", hue="Strategy", legend=False)
        axes[i].set_title(titles[i], fontsize=16, fontweight='bold', pad=20)
        axes[i].set_ylabel(metric, fontsize=12)
        axes[i].set_xlabel("")
        axes[i].tick_params(axis='x', rotation=30)
        
        # Add labels on top
        for p in axes[i].patches:
            axes[i].annotate(f'{p.get_height():.3f}', 
                           (p.get_x() + p.get_width() / 2., p.get_height()), 
                           ha='center', va='center', 
                           xytext=(0, 9), 
                           textcoords='offset points',
                           fontsize=11, fontweight='bold')

    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'comparative_performance.png'), bbox_inches='tight')
    plt.close()

    # 2. Strategy Mix Heatmap / Stacked Bar for ML Advisor
    if 'ml_advised' in results:
        dist = results['ml_advised']['strategy_distribution']
        dist_df = pd.DataFrame(list(dist.items()), columns=['Selection', 'Count'])
        dist_df['Percentage'] = (dist_df['Count'] / dist_df['Count'].sum()) * 100
        
        plt.figure(figsize=(10, 8))
        colors = [STRATEGY_COLORS.get(s, "#999999") for s in dist_df['Selection']]
        plt.pie(dist_df['Percentage'], labels=dist_df['Selection'], autopct='%1.1f%%', 
                startangle=140, colors=colors, explode=[0.03] * len(dist_df), shadow=True,
                textprops={'fontsize': 12, 'fontweight': 'bold'})
        plt.title("ML Advisor Strategy Distribution Mix", fontsize=18, fontweight='bold', pad=25)
        plt.savefig(os.path.join(output_dir, 'ml_selection_mix.png'), bbox_inches='tight')
        plt.close()

    # 3. Radar Chart (Spider Plot) for Multi-Objective Analysis
    # Comparison between Static EXT2 and ML-Advised
    if 'static_ext2' in results and 'ml_advised' in results:
        labels = ["Success Rate", "Min Fragmentation", "Min Seek", "Utilization"]
        
        # Normalize: For frag/seek, we want (1 - value) so that OUTER is BETTER
        def get_norm_vals(mode_key):
            r = results[mode_key]
            return [
                r['success_rate'],
                1 - r['avg_fragmentation'],
                1 - r['avg_seek_distance'],
                r['avg_utilization']
            ]
        
        baseline_vals = get_norm_vals('static_ext2')
        ml_vals = get_norm_vals('ml_advised')
        
        # Number of variables
        num_vars = len(labels)
        angles = np.linspace(0, 2 * np.pi, num_vars, endpoint=False).tolist()
        
        # Close the loop
        baseline_vals += baseline_vals[:1]
        ml_vals += ml_vals[:1]
        angles += angles[:1]
        
        fig, ax = plt.subplots(figsize=(10, 10), subplot_kw=dict(polar=True))
        ax.fill(angles, baseline_vals, color='red', alpha=0.1, label='Static EXT2')
        ax.plot(angles, baseline_vals, color='red', linewidth=2)
        
        ax.fill(angles, ml_vals, color='teal', alpha=0.25, label='ML-Advised')
        ax.plot(angles, ml_vals, color='teal', linewidth=3)
        
        ax.set_yticklabels([])
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(labels, fontsize=13, fontweight='bold')
        
        plt.title("System Performance Profile: ML vs baseline", fontsize=20, fontweight='bold', pad=30)
        plt.legend(loc='upper right', bbox_to_anchor=(0.1, 0.1), fontsize=12)
        plt.savefig(os.path.join(output_dir, 'performance_radar.png'), bbox_inches='tight')
        plt.close()

    # 4. Feature Importance (Updated with Seaborn)
    model_path = os.path.join(os.path.dirname(json_path), 'allocation_model.pkl')
    if not os.path.exists(model_path):
        # Check in the sibling ml_module directory if not found in desktop
        model_path = os.path.join(os.path.dirname(__file__), 'allocation_model.pkl')

    if os.path.exists(model_path):
        try:
            model = joblib.load(model_path)
            feature_cols = [
                'file_size', 'free_block_ratio', 'external_fragmentation',
                'internal_fragmentation', 'avg_seek_distance', 'creation_rate',
                'deletion_rate', 'disk_utilization'
            ]
            importances = model.feature_importances_
            feat_df = pd.DataFrame({'Feature': [f.replace('_', ' ').title() for f in feature_cols], 'Importance': importances})
            feat_df = feat_df.sort_values(by='Importance', ascending=False)

            plt.figure(figsize=(12, 8))
            sns.barplot(data=feat_df, x='Importance', y='Feature', palette="rocket")
            plt.title('ML Engine Feature Importance Analysis', fontsize=18, fontweight='bold', pad=20)
            plt.xlabel('Weight (Information Gain contribution)', fontsize=12)
            plt.tight_layout()
            plt.savefig(os.path.join(output_dir, 'feature_analysis.png'), bbox_inches='tight')
            plt.close()
        except:
            pass

    print(f"Successfully generated 4 premium graphs in {output_dir}")

if __name__ == "__main__":
    # Check for CLI arguments
    input_file = r'c:\Users\lawre\OneDrive - vit.ac.in\Desktop\osfinal\evaluation_report.json'
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    
    # Use a subfolder 'graphs_premium' in the input's directory
    target_dir = os.path.join(os.path.dirname(input_file), 'graphs_premium')
    generate_premium_graphs(input_file, target_dir)
