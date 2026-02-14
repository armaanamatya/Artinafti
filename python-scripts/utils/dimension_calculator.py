"""
Dimension calculation utilities for aspect-ratio-aware upscaling.

Extracted from the ESRGAN and FLUX upscaler notebooks.
Handles smart scaling for target print sizes with DPI awareness.
"""


def calculate_scale_for_crop(
    input_width: int,
    input_height: int,
    target_width_inches: float,
    target_height_inches: float,
    dpi: int,
) -> dict:
    """
    Calculate the scale factor and output dimensions needed to ensure
    we have enough resolution after cropping to the target aspect ratio.

    The output will be slightly oversized in one dimension so that a human
    can choose the crop offset.

    Args:
        input_width: Input image width in pixels
        input_height: Input image height in pixels
        target_width_inches: Target print width in inches
        target_height_inches: Target print height in inches
        dpi: Target DPI for printing

    Returns:
        dict with output_width_px, output_height_px, final_width_px,
        final_height_px, scale_factor, crop_direction, crop_amount_px,
        crop_amount_inches, equivalent_print_size
    """
    final_width_px = int(target_width_inches * dpi)
    final_height_px = int(target_height_inches * dpi)

    input_aspect = input_width / input_height
    target_aspect = target_width_inches / target_height_inches

    if abs(input_aspect - target_aspect) < 0.01:
        scale_factor = final_width_px / input_width
        return {
            "output_width_px": final_width_px,
            "output_height_px": final_height_px,
            "final_width_px": final_width_px,
            "final_height_px": final_height_px,
            "scale_factor": scale_factor,
            "crop_direction": "none",
            "crop_amount_px": 0,
            "crop_amount_inches": 0.0,
            "equivalent_print_size": f'{target_width_inches}" x {target_height_inches}"',
        }

    if input_aspect < target_aspect:
        # Input is taller — scale to match width, excess height
        output_width_px = final_width_px
        scale_factor = output_width_px / input_width
        output_height_px = int(input_height * scale_factor)

        crop_amount_px = output_height_px - final_height_px
        crop_amount_inches = crop_amount_px / dpi
        crop_direction = "vertical"
        equivalent_height_inches = output_height_px / dpi
        equivalent_print_size = (
            f'{target_width_inches}" x {equivalent_height_inches:.2f}"'
        )
    else:
        # Input is wider — scale to match height, excess width
        output_height_px = final_height_px
        scale_factor = output_height_px / input_height
        output_width_px = int(input_width * scale_factor)

        crop_amount_px = output_width_px - final_width_px
        crop_amount_inches = crop_amount_px / dpi
        crop_direction = "horizontal"
        equivalent_width_inches = output_width_px / dpi
        equivalent_print_size = (
            f'{equivalent_width_inches:.2f}" x {target_height_inches}"'
        )

    return {
        "output_width_px": output_width_px,
        "output_height_px": output_height_px,
        "final_width_px": final_width_px,
        "final_height_px": final_height_px,
        "scale_factor": scale_factor,
        "crop_direction": crop_direction,
        "crop_amount_px": crop_amount_px,
        "crop_amount_inches": crop_amount_inches,
        "equivalent_print_size": equivalent_print_size,
    }


def calculate_output_dimensions(
    input_width: int,
    input_height: int,
    upscale_factor: int = None,
    target_dpi: int = 150,
    target_width_inches: float = None,
    target_height_inches: float = None,
) -> dict:
    """
    Calculate output dimensions based on input size and requirements.

    If target print size is NOT provided:
      - Output = input_size x upscale_factor

    If target print size IS provided:
      - Uses calculate_scale_for_crop for aspect-ratio-aware scaling

    Returns:
        dict with output_width, output_height, scale_factor, crop_info
    """
    if target_width_inches is None or target_height_inches is None:
        factor = upscale_factor or 4
        return {
            "output_width": input_width * factor,
            "output_height": input_height * factor,
            "scale_factor": factor,
            "crop_info": None,
        }

    result = calculate_scale_for_crop(
        input_width, input_height,
        target_width_inches, target_height_inches,
        target_dpi,
    )

    crop_info = None
    if result["crop_direction"] != "none":
        crop_info = {
            "direction": result["crop_direction"],
            "amount_px": result["crop_amount_px"],
            "amount_inches": result["crop_amount_inches"],
        }

    return {
        "output_width": result["output_width_px"],
        "output_height": result["output_height_px"],
        "scale_factor": result["scale_factor"],
        "crop_info": crop_info,
    }
