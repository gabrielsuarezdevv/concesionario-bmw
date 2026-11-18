package dev.gabrielsuarez.atelier;

import jakarta.validation.Valid;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class AtelierController {
    private final CatalogService catalog;
    private final ConfigurationRepository configurations;
    public AtelierController(CatalogService catalog, ConfigurationRepository configurations) { this.catalog=catalog; this.configurations=configurations; }
    @GetMapping("/health") public Map<String, String> health() { return Map.of("status", "UP"); }
    @GetMapping("/catalog") public CatalogService.Catalog catalog() { return catalog.getCatalog(); }
    @PostMapping("/quotes") public CatalogService.Quote quote(@Valid @RequestBody ConfigurationRequest request) { return catalog.quote(request); }
    @PostMapping("/configurations") @ResponseStatus(HttpStatus.CREATED)
    public SavedConfiguration save(@Valid @RequestBody ConfigurationRequest request) {
        return configurations.save(new SavedConfiguration(request, catalog.quote(request).total()));
    }
    @GetMapping("/configurations/{id}") public SavedConfiguration get(@PathVariable UUID id) {
        return configurations.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
