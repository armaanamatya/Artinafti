export declare class FluxUpscaleDto {
    upscale_factor?: number;
    target_dpi?: number;
    target_width_inches?: number;
    target_height_inches?: number;
    denoise?: number;
    steps?: number;
    tile_size?: number;
    upscale_model?: string;
    output_format?: string;
    positive_prompt?: string;
    guidance?: number;
    seed?: number;
    cfg?: number;
    sampler_name?: string;
    scheduler?: string;
}
