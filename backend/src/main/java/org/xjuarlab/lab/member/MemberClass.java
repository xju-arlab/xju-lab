package org.xjuarlab.lab.member;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public record MemberClass(String value, int grade) {
    private static final Pattern FORMAT = Pattern.compile("^([一-鿿A-Za-z]{2,20})(\\d{2})-([1-9]\\d?)$");

    public static MemberClass parse(String input) {
        String value = input == null ? "" : input.trim();
        Matcher match = FORMAT.matcher(value);
        if (!match.matches()) throw new IllegalArgumentException("班级格式应为专业简称+两位入学年份-班号，例如 计算机24-3");
        return new MemberClass(value, Integer.parseInt(match.group(2)));
    }
}
