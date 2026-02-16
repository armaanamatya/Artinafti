import { LambdaService } from './lambda.service';
import { LaunchInstanceDto, TerminateInstanceDto } from './dto/launch-instance.dto';
export declare class LambdaController {
    private readonly lambdaService;
    constructor(lambdaService: LambdaService);
    getInstanceTypes(): Promise<any>;
    launchInstance(dto: LaunchInstanceDto): Promise<any>;
    listInstances(): Promise<any>;
    getInstanceStatus(instanceId: string): Promise<any>;
    deployToInstance(instanceId: string): Promise<{
        success: boolean;
        healthy: boolean;
        api_url: string;
    } | {
        success: boolean;
        error: string;
    }>;
    terminateInstances(dto: TerminateInstanceDto): Promise<any>;
}
