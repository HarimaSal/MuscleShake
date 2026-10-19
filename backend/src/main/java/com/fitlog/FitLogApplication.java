package com.fitlog;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FitLogApplication {
    public static void main(String[] args) {
        SpringApplication.run(FitLogApplication.class, args);
    }
}
