package dev.gabrielsuarez.atelier;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ConfigurationRequest(
    @NotBlank @Size(max=20) String model,
    @NotBlank @Size(max=20) String paint,
    @NotBlank @Size(max=20) String wheels,
    @NotBlank @Size(max=20) String interior) {}
