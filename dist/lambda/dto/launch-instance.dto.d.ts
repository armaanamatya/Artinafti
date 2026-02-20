export declare class LaunchInstanceDto {
    instance_type_name: string;
    region_name: string;
    ssh_key_names?: string[];
    name?: string;
}
export declare class TerminateInstanceDto {
    instance_ids: string[];
}
