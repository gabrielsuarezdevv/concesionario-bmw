package dev.gabrielsuarez.atelier;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CatalogService {
    public record Car(String id, String name, String subtitle, int price, String power, String acceleration, String drive) {}
    public record Option(String id, String name, int price, String hex) {}
    public record Catalog(List<Car> models, List<Option> paints, List<Option> wheels, List<Option> interiors) {}
    public record Quote(int basePrice, int optionsPrice, int total, String currency, boolean demonstration) {}
    private final Catalog catalog = new Catalog(
        List.of(new Car("m4", "M4 Competition", "La expresión del carácter.", 124500, "530", "3,5", "M xDrive"),
            new Car("e46", "330i E46", "El carácter de un clásico.", 35000, "231", "6,5", "Trasera"),
            new Car("m2", "M2 G87", "Toda la esencia M. Sin filtros.", 96900, "460", "4,1", "Trasera")),
        List.of(new Option("blue", "Portimao Blue", 0, "#2868b2"), new Option("grey", "Brooklyn Grey", 1100, "#a2a8a6"),
            new Option("black", "Sapphire Black", 1100, "#202326"), new Option("green", "Isle of Man Green", 1900, "#276b5c"), new Option("white", "Alpine White", 0, "#e8e8de")),
        List.of(new Option("sport", "M · Acabado Plata", 0, null), new Option("forged", "M · Acabado Jet Black", 2400, null)),
        List.of(new Option("black", "Merino · Negro", 0, "#252827"), new Option("cognac", "Merino · Tartufo", 1800, "#9a5730"), new Option("ivory", "Merino · Silverstone", 2200, "#c9c5b5")));
    public Catalog getCatalog() { return catalog; }
    public Quote quote(ConfigurationRequest request) {
        Car model = catalog.models().stream().filter(m -> m.id().equals(request.model())).findFirst().orElseThrow(CatalogService::invalid);
        int options = find(catalog.paints(), request.paint()).price() + find(catalog.wheels(), request.wheels()).price() + find(catalog.interiors(), request.interior()).price();
        return new Quote(model.price(), options, model.price() + options, "EUR", true);
    }
    private Option find(List<Option> options, String id) { return options.stream().filter(o -> o.id().equals(id)).findFirst().orElseThrow(CatalogService::invalid); }
    private static ResponseStatusException invalid() { return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Modelo u opción desconocidos."); }
}
