import re


STUDENT_ID_PATTERN = re.compile(r"^ITBIN\d{8}$")


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def normalize_student_id(student_id: str) -> str:
    return student_id.strip().upper()


def is_valid_student_id(student_id: str) -> bool:
    return bool(STUDENT_ID_PATTERN.fullmatch(normalize_student_id(student_id)))
