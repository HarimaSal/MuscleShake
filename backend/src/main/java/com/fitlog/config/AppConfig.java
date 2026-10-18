package com.fitlog.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Configuration
@EnableConfigurationProperties(AppProps.class)
public class AppConfig {
    private static final Logger log = LoggerFactory.getLogger(AppConfig.class);

    private final AppProps props;

    public AppConfig(AppProps props) {
        this.props = props;
    }

    @PostConstruct
    public void prepareDirs() {
        Path projectRoot = projectRoot();
        Path dataDir = resolve(projectRoot, props.getDataDir(), projectRoot.resolve("backend/data"));
        Path uploadDir = resolve(projectRoot, props.getUploadDir(), dataDir.resolve("uploads"));
        Path exportDir = resolve(projectRoot, props.getExportDir(), dataDir.resolve("exports"));

        props.setDataDir(dataDir.toString());
        props.setUploadDir(uploadDir.toString());
        props.setExportDir(exportDir.toString());
        try {
            Files.createDirectories(uploadDir);
            Files.createDirectories(exportDir);
        } catch (Exception e) {
            throw new IllegalStateException("无法创建数据目录：" + dataDir, e);
        }
        log.info("FitLog data dir: {}", dataDir);
    }

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper();
    }

    /**
     * 统一以仓库根目录为基准解析相对路径，避免从 backend/ 或根目录启动时产生 backend/backend/data。
     */
    private Path projectRoot() {
        Path cwd = Paths.get(System.getProperty("user.dir")).toAbsolutePath().normalize();
        Path cursor = cwd;
        while (cursor != null) {
            if (Files.isRegularFile(cursor.resolve("backend/pom.xml")) && Files.isRegularFile(cursor.resolve("frontend/package.json"))) {
                return cursor;
            }
            if (Files.isRegularFile(cursor.resolve("pom.xml")) && cursor.getFileName() != null
                    && "backend".equals(cursor.getFileName().toString())) {
                return cursor.getParent();
            }
            cursor = cursor.getParent();
        }
        return cwd;
    }

    private Path resolve(Path root, String raw, Path fallback) {
        if (raw == null || raw.isBlank()) return fallback.toAbsolutePath().normalize();
        Path path = Paths.get(raw);
        return (path.isAbsolute() ? path : root.resolve(path)).toAbsolutePath().normalize();
    }
}
