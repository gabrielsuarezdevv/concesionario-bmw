package dev.gabrielsuarez.atelier;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ConfigurationRepository extends JpaRepository<SavedConfiguration, UUID> {}
