package dev.gabrielsuarez.atelier;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface OrderRepository extends JpaRepository<PurchaseOrder, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from PurchaseOrder o where o.id = :id")
    Optional<PurchaseOrder> lock(@Param("id") Long id);
    @Query("select o.id from PurchaseOrder o where o.emailStatus = :state and o.nextEmailAttempt <= :now order by o.createdAt")
    List<Long> pending(@Param("state") PurchaseOrder.EmailStatus state, @Param("now") Instant now, Pageable page);
}
