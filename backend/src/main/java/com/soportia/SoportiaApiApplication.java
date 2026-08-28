package com.soportia;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SoportiaApiApplication {

	public static void main(String[] args) {
		SpringApplication.run(SoportiaApiApplication.class, args);
	}

}
