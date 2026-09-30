package org.xjuarlab.lab.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.xjuarlab.lab.security.MemberRegistrationInterceptor;

@Configuration
public class WebConfiguration implements WebMvcConfigurer {
    private final MemberRegistrationInterceptor registrationInterceptor;

    public WebConfiguration(MemberRegistrationInterceptor registrationInterceptor) {
        this.registrationInterceptor = registrationInterceptor;
    }

    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(registrationInterceptor).addPathPatterns("/api/v1/**");
    }
}
