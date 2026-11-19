package dev.gabrielsuarez.atelier;

import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes=CheckoutController.class)
public class CheckoutErrors {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String,Object>> validation(MethodArgumentNotValidException exception) {
        Map<String,String> fields=new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors().forEach(e->fields.putIfAbsent(e.getField(),e.getDefaultMessage()));
        return ResponseEntity.badRequest().cacheControl(CacheControl.noStore()).body(Map.of("message","Revisa los datos del formulario.","fields",fields));
    }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String,String>> status(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).cacheControl(CacheControl.noStore()).body(Map.of("message",Objects.requireNonNullElse(exception.getReason(),"No se ha podido completar la solicitud.")));
    }
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<Map<String,String>> invalidLink() {
        return ResponseEntity.badRequest().cacheControl(CacheControl.noStore()).body(Map.of("message","El enlace de compra no es válido."));
    }
}
