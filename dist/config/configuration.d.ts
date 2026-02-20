declare const _default: () => {
    port: number;
    uploadDir: string;
    outputDir: string;
    modelCacheDir: string;
    pythonPath: string;
    redis: {
        host: string;
        port: number;
    };
    defaults: {
        dpi: number;
        upscaleFactor: number;
        maxConcurrentJobs: number;
    };
    gcp: {
        projectId: string;
        region: string;
    };
    lambda: {
        apiKey: string;
        sshKeyName: string;
        defaultRegion: string;
        repoUrl: string;
    };
    aws: {
        region: string;
        amiId: string;
        instanceType: string;
        keyName: string;
        securityGroupIds: string;
        subnetId: string;
        repoUrl: string;
    };
};
export default _default;
