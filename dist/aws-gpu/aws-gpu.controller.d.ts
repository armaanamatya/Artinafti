import { AwsGpuService } from './aws-gpu.service';
import { LaunchAwsInstanceDto, InstanceIdsDto, RestoreInstanceDto } from './dto/aws-gpu.dto';
export declare class AwsGpuController {
    private readonly awsGpuService;
    constructor(awsGpuService: AwsGpuService);
    getInstanceTypes(): Promise<{
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
    launchInstance(dto: LaunchAwsInstanceDto): Promise<{
        instance_id: string;
        instance_type: import("@aws-sdk/client-ec2")._InstanceType;
        state: import("@aws-sdk/client-ec2").InstanceStateName;
        launch_time: Date;
    }>;
    listInstances(): Promise<{
        instance_id: string;
        instance_type: import("@aws-sdk/client-ec2")._InstanceType;
        state: import("@aws-sdk/client-ec2").InstanceStateName;
        ip: string;
        launch_time: Date;
        name: string;
    }[]>;
    getInstanceStatus(instanceId: string): Promise<{
        instance_id: string;
        instance_type: import("@aws-sdk/client-ec2")._InstanceType;
        state: import("@aws-sdk/client-ec2").InstanceStateName;
        ip: string;
        private_ip: string;
        launch_time: Date;
        tags: import("@aws-sdk/client-ec2").Tag[];
    }>;
    startInstances(dto: InstanceIdsDto): Promise<{
        instance_id: string;
        previous_state: import("@aws-sdk/client-ec2").InstanceStateName;
        current_state: import("@aws-sdk/client-ec2").InstanceStateName;
    }[]>;
    stopInstances(dto: InstanceIdsDto): Promise<{
        instance_id: string;
        previous_state: import("@aws-sdk/client-ec2").InstanceStateName;
        current_state: import("@aws-sdk/client-ec2").InstanceStateName;
    }[]>;
    terminateInstances(dto: InstanceIdsDto): Promise<{
        instance_id: string;
        previous_state: import("@aws-sdk/client-ec2").InstanceStateName;
        current_state: import("@aws-sdk/client-ec2").InstanceStateName;
    }[]>;
    waitForRunning(instanceId: string): Promise<{
        instance_id: string;
        instance_type: import("@aws-sdk/client-ec2")._InstanceType;
        state: import("@aws-sdk/client-ec2").InstanceStateName;
        ip: string;
        private_ip: string;
        launch_time: Date;
        tags: import("@aws-sdk/client-ec2").Tag[];
    }>;
    shelveInstance(instanceId: string): Promise<{
        ami_id: string;
        ami_name: string;
        shelved_from: string;
        message: string;
    }>;
    restoreInstance(dto: RestoreInstanceDto): Promise<{
        instance_id: string;
        instance_type: import("@aws-sdk/client-ec2")._InstanceType;
        state: import("@aws-sdk/client-ec2").InstanceStateName;
        restored_from: string;
    }>;
    listShelved(): Promise<{
        ami_id: string;
        name: string;
        state: import("@aws-sdk/client-ec2").ImageState;
        created: string;
        shelved_from: string;
    }[]>;
    deleteShelved(amiId: string): Promise<{
        deleted_ami: string;
        deleted_snapshots: string[];
        message: string;
    }>;
}
