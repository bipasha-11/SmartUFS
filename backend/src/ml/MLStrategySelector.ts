import http from 'http';
import { DiskManager } from '../managers/DiskManager';
import { FeatureExtractor, FeatureVector } from './FeatureExtractor';
import { MLDecisionLog, MLDecisionEntry } from './MLDecisionLog';

export interface MLPrediction {
    strategy: string;
    confidence: number;
    probabilities?: Record<string, number>;
}

export class MLStrategySelector {
    private extractor: FeatureExtractor;
    public decisionLog: MLDecisionLog;
    public isServiceAvailable: boolean = true;
    private readonly PREDICTOR_URL = 'http://127.0.0.1:5000/predict';
    private readonly HEALTH_URL = 'http://127.0.0.1:5000/health';

    constructor() {
        this.extractor = new FeatureExtractor();
        this.decisionLog = new MLDecisionLog();
    }

    /**
     * Records an operation for feature extraction.
     */
    public recordOp(type: 'create' | 'delete' | 'read', blockPosition: number): void {
        this.extractor.recordOperation(type, blockPosition);
    }

    /**
     * Resets the advisor state.
     */
    public reset(): void {
        this.extractor.reset();
        this.decisionLog.clear();
    }

    /**
     * Recommends an allocation strategy based on ML prediction.
     */
    public async advise(manager: DiskManager, requestedSize: number): Promise<{
        recommended: string;
        prediction?: MLPrediction;
        usedFallback: boolean;
        error?: string;
    }> {
        const features = this.extractor.extract(manager, requestedSize);

        try {
            const prediction = await this.callPredictor(features);
            this.isServiceAvailable = true;
            return {
                recommended: prediction.strategy,
                prediction,
                usedFallback: false
            };
        } catch (err: any) {
            this.isServiceAvailable = false;
            return {
                recommended: 'ext2', // Safe fallback
                usedFallback: true,
                error: err.message || 'Unknown prediction error'
            };
        }
    }

    /**
     * Logs the outcome of a decision.
     */
    public logDecision(
        advisory: any,
        actualStrategy: string,
        success: boolean,
        postFrag: number,
        postUtil: number,
        seekDelta: number,
        overhead: number
    ): void {
        this.decisionLog.record({
            features: advisory.prediction ? advisory.prediction.features : {}, // Optional: store features if available
            predictedStrategy: advisory.prediction?.strategy || 'none',
            confidence: advisory.prediction?.confidence || 0,
            probabilities: advisory.prediction?.probabilities || {},
            actualStrategy,
            allocationSuccess: success,
            postFragmentation: postFrag,
            postUtilization: postUtil,
            seekDistanceDelta: seekDelta,
            mlOverheadMs: overhead
        } as any); // Type cast since we might not have all fields perfectly aligned
    }

    private async callPredictor(features: FeatureVector): Promise<MLPrediction> {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(features);
            const options = {
                hostname: 'localhost',
                port: 5000,
                path: '/predict',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                },
                timeout: 1000
            };

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const parsed = JSON.parse(body);
                            // Handle either 'confidence' or 'probability' from Python
                            const confidence = parsed.confidence !== undefined ? parsed.confidence : (parsed.probability || 0);

                            resolve({
                                strategy: parsed.strategy,
                                confidence,
                                probabilities: parsed.probabilities || {}
                            });
                        } catch (e) {
                            reject(new Error('Failed to parse response'));
                        }
                    } else {
                        reject(new Error(`Service error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', (e) => reject(e));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Predictor timed out'));
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Checks the health of the ML service.
     */
    public async checkServiceHealth(): Promise<{ status: string; model_loaded: boolean }> {
        return new Promise((resolve) => {
            http.get(this.HEALTH_URL, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const parsed = JSON.parse(body);
                            this.isServiceAvailable = true;
                            resolve(parsed);
                        } catch (e) {
                            this.isServiceAvailable = false;
                            resolve({ status: 'error', model_loaded: false });
                        }
                    } else {
                        this.isServiceAvailable = false;
                        resolve({ status: 'offline', model_loaded: false });
                    }
                });
            }).on('error', () => {
                this.isServiceAvailable = false;
                resolve({ status: 'offline', model_loaded: false });
            });
        });
    }
}
