"""Display names: source data is ALL CAPS; the deck shows title case with Indonesian small words."""
from __future__ import annotations

import re

SMALL = {
    "di", "dari", "dengan", "yang", "dan", "ke", "untuk", "dalam", "pada", "atau", "para", "si", "sang",
    "of", "the", "for", "and", "in", "on", "at", "to", "a", "an", "with", "from", "by", "or",
}
UPPER = {
    "IMAX", "2D", "3D", "4D", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "RI", "USA", "NCT",
    "KKN", "BTS", "UK", "NYC", "FBI", "CIA", "TV", "AI", "DC", "OK", "SMA", "SMP", "SD", "TNI", "POLRI", "ASMR",
    "M3GAN", "F1", "G20",
}
# Titles as printed in the deck (kit 06_FAKTA_ANGKA part F) and spellings title case cannot derive.
OVERRIDES = {
    "JANUR IRENG: SEWU DINO THE PREQUEL": "Janur Ireng: Sewu Dino The Prequel",
    "COMIC 8 REVOLUTION SANTET K4BINET": "Comic 8 Revolution: Santet K4binet",
    "THE SPONGEBOB MOVIE: SEARCH FOR SQUAREPANTS": "The SpongeBob Movie: Search for SquarePants",
    "DEMON SLAYER -KIMETSU NO YAIBA- THE MOVIE: INFINITY CASTLE": "Demon Slayer: Infinity Castle",
    "BELIEVE - TAKDIR, MIMPI, KEBERANIAN": "Believe: Takdir, Mimpi, Keberanian",
    "THUNDERBOLTS*": "Thunderbolts*",
    "MENJELANG MAGRIB 2: WANITA YANG DI RANTAI": "Menjelang Magrib 2: Wanita yang Dirantai",
    "FIVE NIGHTS AT FREDDYS 2": "Five Nights at Freddy's 2",
    "NOW YOU SEE ME: NOW YOU DONT": "Now You See Me: Now You Don't",
    "GOOD LUCK, HAVE FUN, DONT DIE": "Good Luck, Have Fun, Don't Die",
    "THE CARPENTERS SON": "The Carpenter's Son",
    "THE SHADOWS EDGE": "The Shadow's Edge",
    "GREENLAND 2 : MIGRATION": "Greenland 2: Migration",
    "WARKOP DKI KARTUN": "Warkop DKI Kartun",
}
CITY_OVERRIDES = {"BAU-BAU": "Bau-Bau", "PANGKAL PINANG": "Pangkal Pinang"}


def _word(word: str, first: bool) -> str:
    bare = re.sub(r"[^\w']", "", word).upper()
    if bare in UPPER:
        return word.upper()
    if not first and bare.lower() in SMALL:
        return word.lower()
    return re.sub(r"[^\W\d_]+('[^\W\d_]+)?", lambda m: m.group(0).capitalize(), word.lower(), count=0)


def film_title(raw: str) -> str:
    """'DANUR: THE LAST CHAPTER (IMAX 2D)' -> 'Danur: The Last Chapter (IMAX 2D)'."""
    base, sep, suffix = raw.partition(" (")
    if base in OVERRIDES:
        shown = OVERRIDES[base]
    else:
        words = base.split(" ")
        out = []
        restart = True
        for word in words:
            out.append(_word(word, restart))
            restart = word.endswith(":") or word in {"-", "–"}
        shown = re.sub(r" the Movie\b", " The Movie", " ".join(out))
    if not sep:
        return shown
    tag = suffix.rstrip(")")
    return f"{shown} ({tag if any(ch.isdigit() for ch in tag) else tag.title()})"


def city_title(raw: str) -> str:
    if raw in CITY_OVERRIDES:
        return CITY_OVERRIDES[raw]
    return " ".join(part.capitalize() for part in raw.split(" "))
