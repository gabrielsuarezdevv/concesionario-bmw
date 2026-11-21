package dev.gabrielsuarez.atelier;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface CheckoutRepository extends JpaRepository<CheckoutSession, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from CheckoutSession c where c.id = :id")
    Optional<CheckoutSession> lock(@Param("id") UUID id);
}
