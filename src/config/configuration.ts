export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  uploadDir: process.env.UPLOAD_DIR || '/app/uploads',
  outputDir: process.env.OUTPUT_DIR || '/app/results',
  modelCacheDir: process.env.MODEL_CACHE_DIR || '/app/models',
  pythonPath: process.env.PYTHON_PATH || 'python3',
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
  defaults: {
    dpi: parseInt(process.env.DEFAULT_DPI, 10) || 150,
    upscaleFactor: parseInt(process.env.DEFAULT_UPSCALE_FACTOR, 10) || 4,
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS, 10) || 1,
  },
  gcp: {
    projectId: process.env.GCP_PROJECT_ID || 'artinafti',
    region: process.env.GCP_REGION || 'us-central1',
  },
  lambda: {
    apiKey: process.env.LAMBDA_API_KEY || '',
    sshKeyName: process.env.LAMBDA_SSH_KEY_NAME || '',
    defaultRegion: process.env.LAMBDA_DEFAULT_REGION || 'us-east-1',
    repoUrl: process.env.LAMBDA_REPO_URL || '',
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    amiId: process.env.AWS_GPU_AMI_ID || '',
    instanceType: process.env.AWS_GPU_INSTANCE_TYPE || 'g5.xlarge',
    keyName: process.env.AWS_KEY_NAME || '',
    securityGroupIds: process.env.AWS_SECURITY_GROUP_IDS || '',
    subnetId: process.env.AWS_SUBNET_ID || '',
    repoUrl: process.env.AWS_REPO_URL || process.env.LAMBDA_REPO_URL || '',
  },
});
