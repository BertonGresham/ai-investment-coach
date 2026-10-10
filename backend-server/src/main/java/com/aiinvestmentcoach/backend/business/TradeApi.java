package com.aiinvestmentcoach.backend.business;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;

public final class TradeApi {
    private TradeApi() {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Stock(@NotBlank @Size(max=24) String symbol, @Size(max=120) String name, @Size(max=24) String market) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Execution(@NotBlank @Size(max=100) String execution_id,
        @NotNull @Pattern(regexp="buy|sell") String side, @NotBlank @Size(max=40) String time,
        @NotNull @DecimalMin("0.00000001") @DecimalMax("1000000000000") BigDecimal price,
        @NotNull @Min(1) @Max(100000000) Long quantity, @Size(max=1000) String reason) {}
    public record Trade(@NotEmpty @Size(max=100) List<@NotNull @Valid Execution> executions, boolean execution_order_confirmed) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Decision(@Size(max=1000) String buy_reason,@Size(max=1000) String sell_reason,
        @Min(1) @Max(5) Integer confidence_level,@Size(max=80) String planned_holding_period,
        @Min(0) Integer actual_holding_period_minutes) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Market(@Size(max=1000) String trend_before_buy,@Size(max=1000) String volume_price_summary,
        @Size(max=2000) String kline_summary,@Size(max=1000) String news_summary) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Context(@Pattern(regexp="zh-CN|ko-KR") String language,@Size(max=300) String analysis_goal,Boolean risk_notice_required) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Evidence(@NotBlank @Size(max=200) String source,@NotBlank @Size(max=200) String title,
        @NotBlank @Size(max=2000) String content,@DecimalMin("0") @DecimalMax("1") BigDecimal score) {}
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Request(@Size(max=100) String user_id,@Size(max=100) String trade_id,
        @NotNull @Valid Stock stock,@NotNull @Valid Trade trade,@Valid Decision decision,
        @Valid Market market_snapshot,@Valid Context analysis_context,
        @Size(max=5) List<@NotNull @Valid Evidence> rag_context) {}
}
