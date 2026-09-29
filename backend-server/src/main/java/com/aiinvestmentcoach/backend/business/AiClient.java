package com.aiinvestmentcoach.backend.business;

import com.fasterxml.jackson.databind.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import static org.springframework.http.HttpStatus.*;

@Component
public class AiClient {
    public record Analysis(JsonNode result,String mode) {}
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final String base;
    private final ObjectMapper json;
    public AiClient(@Value("${services.ai-service-url}") String base,ObjectMapper json){this.base=base.replaceAll("/$","");this.json=json;}
    public Analysis analyze(JsonNode request) {
        try {
            var health=http.send(HttpRequest.newBuilder(URI.create(base+"/health")).timeout(Duration.ofSeconds(5)).GET().build(),HttpResponse.BodyHandlers.ofString());
            if(health.statusCode()!=200)throw new ResponseStatusException(BAD_GATEWAY,"AI service unavailable; trade remains saved");
            String mode=json.readTree(health.body()).path("analysis_mode").asText("unknown");
            var response=http.send(HttpRequest.newBuilder(URI.create(base+"/analyze-trade"))
                .timeout(Duration.ofSeconds(45)).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(request))).build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()==422)throw new ResponseStatusException(UNPROCESSABLE_ENTITY,"AI service rejected trade fields; verify the integration contract");
            if(response.statusCode()!=200)throw new ResponseStatusException(BAD_GATEWAY,"AI analysis failed; trade remains saved and may be retried");
            JsonNode result=json.readTree(response.body());
            if(!result.isObject() || !request.path("trade_id").asText().equals(result.path("trade_id").asText())
                || !"single_trade_behavior_analysis".equals(result.path("analysis_type").asText())
                || !result.path("behavior_summary").isTextual() || !result.path("trade_time").isTextual()
                || !result.path("detected_behavior_problems").isArray() || !result.path("personality_tags").isArray()
                || !result.path("coaching_advice").isArray() || !result.path("reflection_questions").isArray()
                || !result.path("risk_notice").isTextual() || !result.path("uncertainty").isObject())
                throw new ResponseStatusException(BAD_GATEWAY,"AI service returned an invalid report");
            return new Analysis(result,mode);
        }catch(ResponseStatusException e){throw e;}
        catch(InterruptedException e){Thread.currentThread().interrupt();throw new ResponseStatusException(BAD_GATEWAY,"AI request interrupted; retry later");}
        catch(Exception e){throw new ResponseStatusException(BAD_GATEWAY,"AI service unavailable or invalid response; trade remains saved");}
    }
}
