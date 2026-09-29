package com.aiinvestmentcoach.backend.business;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api")
@Validated
public class BackendController {
    private final AuthService auth;
    private final TradeService trades;
    public BackendController(AuthService auth,TradeService trades){this.auth=auth;this.trades=trades;}
    @PostMapping("/auth/register") @ResponseStatus(HttpStatus.CREATED)
    public AuthService.Session register(@Valid @RequestBody AuthService.Register request){return auth.register(request);}
    @PostMapping("/auth/login")
    public AuthService.Session login(@Valid @RequestBody AuthService.Login request){return auth.login(request);}
    @PostMapping("/auth/logout") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request){auth.logout(request.getHeader("Authorization"));}
    @GetMapping("/me")
    public AuthService.Identity me(@RequestAttribute("identity") AuthService.Identity identity){return identity;}
    @PostMapping("/trades") @ResponseStatus(HttpStatus.CREATED)
    public TradeService.TradeView create(@RequestAttribute("identity") AuthService.Identity identity,
        @RequestHeader(value="Idempotency-Key",required=false) String key,@Valid @RequestBody TradeApi.Request request){return trades.create(identity.user_id(),key,request);}
    @GetMapping("/trades")
    public List<TradeService.TradeView> list(@RequestAttribute("identity") AuthService.Identity identity,
        @RequestParam(defaultValue="0") @Min(0) int offset,@RequestParam(defaultValue="20") @Min(1) @Max(100) int limit){return trades.list(identity.user_id(),offset,limit);}
    @GetMapping("/trades/{id}")
    public TradeService.TradeView detail(@RequestAttribute("identity") AuthService.Identity identity,@PathVariable String id){return trades.detail(identity.user_id(),id);}
    @PostMapping("/trades/{id}/analysis")
    public TradeService.Report analyze(@RequestAttribute("identity") AuthService.Identity identity,@PathVariable String id){return trades.analyze(identity.user_id(),id);}
    @GetMapping("/trades/{id}/report")
    public TradeService.Report report(@RequestAttribute("identity") AuthService.Identity identity,@PathVariable String id){return trades.report(identity.user_id(),id);}
    @GetMapping("/reports")
    public List<TradeService.Report> reports(@RequestAttribute("identity") AuthService.Identity identity,
        @RequestParam(defaultValue="0") @Min(0) int offset,@RequestParam(defaultValue="20") @Min(1) @Max(100) int limit){return trades.reports(identity.user_id(),offset,limit);}
}
