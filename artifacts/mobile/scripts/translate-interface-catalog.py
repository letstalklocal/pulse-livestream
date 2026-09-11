"""Generate bundled catalogs from reviewed interface copy; never run at app runtime.

Requires explicit approval to send source-strings.json to Google Cloud Translation.
Uses the existing GOOGLE_TRANSLATE_API_KEY without logging it. Resumes missing keys.
"""
import argparse
import collections
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / 'i18n'
TERMS = json.loads((ROOT / 'terminology.json').read_text())['protectedTerms']
PROTECTED = re.compile(r'\{\w+\}|' + '|'.join(
    r'(?<![A-Za-z])' + re.escape(term) + r'(?![A-Za-z])'
    for term in sorted(TERMS, key=len, reverse=True)))


def protect(source):
    parts, tokens, end = [], [], 0
    for match in PROTECTED.finditer(source):
        parts.append(html.escape(source[end:match.start()]))
        tokens.append(match.group())
        parts.append(f'<span class="notranslate" translate="no" data-p="{len(tokens)-1}">{html.escape(match.group())}</span>')
        end = match.end()
    parts.append(html.escape(source[end:]))
    return ''.join(parts), tokens


class Restore(HTMLParser):
    def __init__(self, tokens):
        super().__init__(convert_charrefs=True)
        self.tokens, self.parts, self.depth = tokens, [], 0

    def handle_starttag(self, tag, attrs):
        if self.depth:
            self.depth += 1
        elif 'data-p' in dict(attrs):
            self.parts.append(self.tokens[int(dict(attrs)['data-p'])])
            self.depth = 1

    def handle_endtag(self, tag):
        if self.depth:
            self.depth -= 1

    def handle_data(self, data):
        if not self.depth:
            self.parts.append(data)


def validate(source, translated):
    if not isinstance(translated, str) or not translated.strip():
        raise ValueError('Empty translation')
    if collections.Counter(re.findall(r'\{\w+\}', source)) != collections.Counter(re.findall(r'\{\w+\}', translated)):
        raise ValueError('Placeholder mismatch')
    for term in TERMS:
        pattern = r'(?<![A-Za-z])' + re.escape(term) + r'(?![A-Za-z])'
        if len(re.findall(pattern, translated)) < len(re.findall(pattern, source)):
            raise ValueError('Protected term mismatch')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def main():
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument('--refresh-term', action='append', choices=TERMS, default=[],
                           help='Regenerate only existing phrases containing this protected English term.')
    options = arguments.parse_args()
    key = os.environ.get('GOOGLE_TRANSLATE_API_KEY')
    if not key:
        raise SystemExit('GOOGLE_TRANSLATE_API_KEY is unavailable.')
    sources = json.loads((ROOT / 'source-strings.json').read_text())
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    refresh = {source for source in sources if any(
        re.search(r'(?<![A-Za-z])' + re.escape(term) + r'(?![A-Za-z])', source)
        for term in options.refresh_term)}
    opener = urllib.request.build_opener(NoRedirect())
    for language in manifest['languages']:
        if language == 'en':
            continue
        path = ROOT / 'locales' / f'{language}.json'
        catalog = json.loads(path.read_text()) if path.exists() else {}
        for source, translated in catalog.items():
            if source not in sources:
                raise ValueError('Unknown existing source key')
            if source not in refresh:
                validate(source, translated)
        missing = [source for source in sources if source not in catalog or source in refresh]
        for offset in range(0, len(missing), 50):
            batch = missing[offset:offset+50]
            protected = [protect(source) for source in batch]
            payload = json.dumps({'q': [value for value, _ in protected], 'source': 'en',
                                  'target': 'pt' if language == 'pt-BR' else language,
                                  'format': 'html'}).encode()
            request = urllib.request.Request('https://translation.googleapis.com/language/translate/v2',
                data=payload, headers={'Content-Type': 'application/json', 'X-Goog-Api-Key': key})
            for attempt in range(3):
                try:
                    with opener.open(request, timeout=45) as response:
                        result = json.load(response)['data']['translations']
                    break
                except urllib.error.HTTPError as error:
                    if (error.code == 429 or error.code >= 500) and attempt < 2:
                        time.sleep(2 ** (attempt + 1))
                        continue
                    raise SystemExit(f'Translation stopped: HTTP {error.code}; completed batches are saved.') from None
                except urllib.error.URLError:
                    raise SystemExit('Translation stopped: network unavailable; completed batches are saved.') from None
            if len(result) != len(batch):
                raise ValueError('Translation count mismatch')
            for source, translated, (_, tokens) in zip(batch, result, protected):
                parser = Restore(tokens)
                parser.feed(translated['translatedText'])
                parser.close()
                value = ''.join(parser.parts).strip()
                prefix = source[:len(source) - len(source.lstrip())]
                suffix = source[len(source.rstrip()):]
                value = prefix + value + suffix
                validate(source, value)
                catalog[source] = value
            temporary = path.with_suffix('.tmp')
            temporary.write_text(json.dumps({source: catalog[source] for source in sources if source in catalog}, ensure_ascii=False, indent=2) + '\n')
            temporary.replace(path)
            print(f'{language}: {min(offset + len(batch), len(missing))}/{len(missing)} requested translations validated and saved', flush=True)
    print('All nine generated catalogs are complete. Native-speaker review remains required.', flush=True)


if __name__ == '__main__':
    main()
