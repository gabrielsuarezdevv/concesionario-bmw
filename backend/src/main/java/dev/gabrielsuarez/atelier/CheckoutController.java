package dev.gabrielsuarez.atelier;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/checkouts")
public class CheckoutController {
    private final CheckoutService checkout;
    public CheckoutController(CheckoutService checkout) { this.checkout=checkout; }
    @PostMapping
    public ResponseEntity<CheckoutService.View> create(@Valid @RequestBody ConfigurationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(checkout.create(request));
    }
    @GetMapping("/{id}")
    public ResponseEntity<CheckoutService.View> get(@PathVariable UUID id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(checkout.get(id));
    }
    @PostMapping("/{id}/orders")
    public ResponseEntity<CheckoutService.Receipt> confirm(@PathVariable UUID id, @Valid @RequestBody BuyerRequest buyer) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(checkout.confirm(id,buyer));
    }
}
