package dev.gabrielsuarez.atelier;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
public class PurchaseOrder {
    public enum EmailStatus { QUEUED, SENT, PREVIEW, FAILED }
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) Long id;
    @Column(nullable=false, unique=true) UUID checkoutId;
    @Column(nullable=false, length=120) String customerName;
    int age;
    @Column(nullable=false, length=254) String email;
    Instant createdAt;
    @Enumerated(EnumType.STRING) EmailStatus emailStatus;
    int emailAttempts;
    Instant nextEmailAttempt;
    Instant emailSentAt;
    protected PurchaseOrder() {}
    public String reference() { return "BMW-" + String.format(java.util.Locale.ROOT, "%06d", id); }
}
