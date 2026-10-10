package com.aiinvestmentcoach.backend.business;

import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.*;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final AuthService auth;
    private final String[] origins;
    public WebConfig(AuthService auth,@Value("${app.cors-origins}") String origins){this.auth=auth;this.origins=origins.split(",");}
    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor(){
            @Override public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler){
                if(request.getMethod().equals("OPTIONS"))return true;
                request.setAttribute("identity",auth.authenticate(request.getHeader("Authorization")));
                return true;
            }
        }).addPathPatterns("/api/**").excludePathPatterns("/api/health","/api/auth/register","/api/auth/login");
    }
    @Override public void addCorsMappings(CorsRegistry registry){
        registry.addMapping("/api/**").allowedOrigins(origins).allowedMethods("GET","POST","OPTIONS")
            .allowedHeaders("Content-Type","Authorization","Idempotency-Key").maxAge(3600);
    }
}
