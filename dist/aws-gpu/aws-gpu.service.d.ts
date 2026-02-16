import { ConfigService } from '@nestjs/config';
export declare class AwsGpuService {
    private readonly configService;
    private readonly logger;
    private readonly ec2;
    private readonly amiId;
    private readonly instanceType;
    private readonly keyName;
    private readonly securityGroupIds;
    private readonly subnetId;
    private readonly region;
    private readonly repoUrl;
    constructor(configService: ConfigService);
    private buildUserData;
    listGpuInstanceTypes(): Promise<{
        instanceType: import("@aws-sdk/client-ec2")._InstanceType;
        vcpus: number;
        memoryMiB: number;
        gpus: {
            name: string;
            manufacturer: string;
            count: number;
            memoryMiB: number;
        }[];
    }[]>;
    launchInstance(name?: string, instanceType?: string): Promise<{
        instance_id: string;
        instance_type: import("@aws-sdk/client-ec2")._InstanceType;
        state: import("@aws-sdk/client-ec2").InstanceStateName;
        launch_time: Date;
    }>;
    getInstance(instanceId: string): Promise<{
        instance_id: string;
        instance_type: import("@aws-sdk/client-ec2")._InstanceType;
        state: import("@aws-sdk/client-ec2").InstanceStateName;
        ip: string;
        private_ip: string;
        launch_time: Date;
        tags: import("@aws-sdk/client-ec2").Tag[];
    }>;
    listInstances(): Promise<{
        instance_id: string;
        instance_type: import("@aws-sdk/client-ec2")._InstanceType;
        state: import("@aws-sdk/client-ec2").InstanceStateName;
        ip: string;
        launch_time: Date;
        name: string;
    }[]>;
    stopInstances(instanceIds: string[]): Promise<{
        instance_id: string;
        previous_state: import("@aws-sdk/client-ec2").InstanceStateName;
        current_state: import("@aws-sdk/client-ec2").InstanceStateName;
    }[]>;
    startInstances(instanceIds: string[]): Promise<{
        instance_id: string;
        previous_state: import("@aws-sdk/client-ec2").InstanceStateName;
        current_state: import("@aws-sdk/client-ec2").InstanceStateName;
    }[]>;
    terminateInstances(instanceIds: string[]): Promise<{
        instance_id: string;
        previous_state: import("@aws-sdk/client-ec2").InstanceStateName;
        current_state: import("@aws-sdk/client-ec2").InstanceStateName;
    }[]>;
    waitForRunning(instanceId: string, timeoutSeconds?: number): Promise<{
        instance_id: string;
        instance_type: import("@aws-sdk/client-ec2")._InstanceType;
        state: import("@aws-sdk/client-ec2").InstanceStateName;
        ip: string;
        private_ip: string;
        launch_time: Date;
        tags: import("@aws-sdk/client-ec2").Tag[];
    }>;
}
