package dev.gabrielsuarez.atelier;

import jakarta.validation.constraints.*;

public record BuyerRequest(
    @NotBlank(message="Introduce tu nombre completo.")
    @Size(min=2, max=120, message="El nombre debe tener entre 2 y 120 caracteres.")
    @Pattern(regexp="^[^\\p{Cntrl}]+$", message="El nombre contiene caracteres no válidos.") String fullName,
    @NotNull(message="Introduce tu edad.")
    @Min(value=18, message="Debes tener 18 años o más para realizar el pedido.")
    @Max(value=120, message="Introduce una edad válida.") Integer age,
    @NotBlank(message="Introduce tu correo electrónico.")
    @Email(message="Introduce un correo electrónico válido.")
    @Size(max=254, message="El correo electrónico es demasiado largo.") String email) {}
