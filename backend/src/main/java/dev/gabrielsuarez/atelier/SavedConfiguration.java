package dev.gabrielsuarez.atelier;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.time.Instant;
import java.util.UUID;

@Entity
public class SavedConfiguration {
    @Id private UUID id;
    private String model;
    private String paint;
    private String wheels;
    private String interior;
    private int total;
    private Instant createdAt;
    protected SavedConfiguration() {}
    public SavedConfiguration(ConfigurationRequest r, int total) {
        this.id=UUID.randomUUID(); this.model=r.model(); this.paint=r.paint(); this.wheels=r.wheels();
        this.interior=r.interior(); this.total=total; this.createdAt=Instant.now();
    }
    public UUID getId() { return id; }
    public String getModel() { return model; }
    public String getPaint() { return paint; }
    public String getWheels() { return wheels; }
    public String getInterior() { return interior; }
    public int getTotal() { return total; }
    public Instant getCreatedAt() { return createdAt; }
}
