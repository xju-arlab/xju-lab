package org.xjuarlab.lab.hongqingting.domain;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class RunnerContracts {
    private RunnerContracts() { }
    public record SummaryRequest(@NotBlank @Pattern(regexp="[0-9]{5,32}") String studentNo) {
        @com.fasterxml.jackson.annotation.JsonAnySetter
        public void unknown(String name,Object value) { throw new IllegalArgumentException("Unsupported field"); }
    }
    public record BatchRequest(@NotBlank @Pattern(regexp="[0-9]{5,32}") String studentNo,
            @NotBlank @Pattern(regexp="location_1_6km") String track,
            @Min(1) @Max(90) int days,
            @NotNull @DecimalMin("-0.9") @DecimalMax("0.9") BigDecimal dailyOffset) {
        @com.fasterxml.jackson.annotation.JsonAnySetter
        public void unknown(String name,Object value) { throw new IllegalArgumentException("Unsupported field"); }
    }
    public record Track(String id, String label, boolean available) { }
    public record Configuration(boolean configured, String schoolNo, List<Track> tracks, int maxDays) { }
    public record Summary(BigDecimal distanceKm, String lastRunAt, String message) { }
    public record Run(UUID id, int ordinal, String status, String message) { }
    public record Batch(UUID id, String studentNo, String track, int days, BigDecimal dailyOffset,
            String status, long version, boolean cancelRequested, OffsetDateTime createdAt, List<Run> runs) { }
    public record Attempt(UUID id, UUID batchId, String studentNo, double dayOffset, long referenceTime) { }
    public record Outcome(String status, String message) { }
}
