package com.fitlog.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "fitlog")
public class AppProps {
    private String secret = "fitlog-dev-secret-change-me";
    private String dataDir = "./backend/data";
    private String uploadDir = "./backend/data/uploads";
    private String exportDir = "./backend/data/exports";
    private boolean isProd = false;
    private boolean showSmsCode = true;
    private boolean enableDemo = true;
    private int quotaGb = 50;
    private double budgetCapCny = 20;
    private int publicDailyQuota = 20;
    private long accessTokenTtlSeconds = 7200;
    private long refreshTokenTtlSeconds = 2592000;
    private long mediaSignTtlSeconds = 7200;

    public String getSecret() { return secret; }
    public void setSecret(String secret) { this.secret = secret; }
    public String getDataDir() { return dataDir; }
    public void setDataDir(String dataDir) { this.dataDir = dataDir; }
    public String getUploadDir() { return uploadDir; }
    public void setUploadDir(String uploadDir) { this.uploadDir = uploadDir; }
    public String getExportDir() { return exportDir; }
    public void setExportDir(String exportDir) { this.exportDir = exportDir; }
    public boolean isProd() { return isProd; }
    public void setProd(boolean prod) { isProd = prod; }
    public boolean isShowSmsCode() { return showSmsCode; }
    public void setShowSmsCode(boolean showSmsCode) { this.showSmsCode = showSmsCode; }
    public boolean isEnableDemo() { return enableDemo; }
    public void setEnableDemo(boolean enableDemo) { this.enableDemo = enableDemo; }
    public int getQuotaGb() { return quotaGb; }
    public void setQuotaGb(int quotaGb) { this.quotaGb = quotaGb; }
    public double getBudgetCapCny() { return budgetCapCny; }
    public void setBudgetCapCny(double budgetCapCny) { this.budgetCapCny = budgetCapCny; }
    public int getPublicDailyQuota() { return publicDailyQuota; }
    public void setPublicDailyQuota(int publicDailyQuota) { this.publicDailyQuota = publicDailyQuota; }
    public long getAccessTokenTtlSeconds() { return accessTokenTtlSeconds; }
    public void setAccessTokenTtlSeconds(long value) { this.accessTokenTtlSeconds = value; }
    public long getRefreshTokenTtlSeconds() { return refreshTokenTtlSeconds; }
    public void setRefreshTokenTtlSeconds(long value) { this.refreshTokenTtlSeconds = value; }
    public long getMediaSignTtlSeconds() { return mediaSignTtlSeconds; }
    public void setMediaSignTtlSeconds(long value) { this.mediaSignTtlSeconds = value; }
}
