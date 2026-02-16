import { ConfigService } from '@nestjs/config';
export declare class LambdaService {
    private readonly configService;
    private readonly logger;
    private readonly apiKey;
    private readonly sshKeyName;
    private readonly defaultRegion;
    private readonly sshKeyPath;
    constructor(configService: ConfigService);
    private get headers();
    listInstanceTypes(): Promise<any>;
    launchInstance(instanceTypeName: string, regionName: string, name?: string): Promise<any>;
    getInstance(instanceId: string): Promise<any>;
    listInstances(): Promise<any>;
    terminateInstances(instanceIds: string[]): Promise<any>;
    deployToInstance(instanceIp: string): Promise<{
        success: boolean;
        healthy: boolean;
        api_url: string;
    }>;
}
