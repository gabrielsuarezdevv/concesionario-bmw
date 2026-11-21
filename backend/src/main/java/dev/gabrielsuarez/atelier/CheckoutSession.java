package dev.gabrielsuarez.atelier;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
public class CheckoutSession {
    @Id UUID id;
    @Version long version;
    String model;
    String paint;
    String wheels;
    String interior;
    String modelName;
    String paintName;
    String wheelsName;
    String interiorName;
    int total;
    Instant createdAt;
    Instant expiresAt;
    Long orderId;
    protected CheckoutSession() {}
}
