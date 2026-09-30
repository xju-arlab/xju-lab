package org.xjuarlab.lab.member;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import org.junit.jupiter.api.Test;

class MemberClassTest {
    @Test void parsesTheTwoDigitAdmissionYearFromApprovedClassFormats() {
        assertThat(MemberClass.parse("计算机24-3")).isEqualTo(new MemberClass("计算机24-3", 24));
        assertThat(MemberClass.parse("信安25-1").grade()).isEqualTo(25);
        assertThat(MemberClass.parse("电信26-2").grade()).isEqualTo(26);
        assertThat(MemberClass.parse("CS24-12").grade()).isEqualTo(24);
    }

    @Test void rejectsMalformedClassValuesInsteadOfAcceptingClientSuppliedGrades() {
        for (String invalid : new String[] { "计算机2024-3", "计算机24班", "计算机24-0", "计24-3", "计算机24-3A", "计算机24—3" }) {
            assertThatThrownBy(() -> MemberClass.parse(invalid)).isInstanceOf(IllegalArgumentException.class);
        }
    }
}
