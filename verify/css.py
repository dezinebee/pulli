import re
def strip_comments(s): return re.sub(r'/\*.*?\*/','',s,flags=re.S)

def parse(css):
    """-> list of (media_context, selector, {prop:value}) in source order"""
    css = strip_comments(css)
    out, i, n = [], 0, len(css)
    stack = []          # open at-rule preludes
    buf = ''
    while i < n:
        ch = css[i]
        if ch == '{':
            prelude = buf.strip(); buf=''
            if prelude.startswith('@'):
                stack.append(prelude); i+=1; continue
            # a rule — find its matching close
            depth=1; j=i+1
            while j<n and depth:
                if css[j]=='{':depth+=1
                elif css[j]=='}':depth-=1
                j+=1
            body=css[i+1:j-1]
            decls={}
            for d in body.split(';'):
                if ':' in d:
                    k,_,v=d.partition(':')
                    k=k.strip()
                    if k.startswith('--') or k: decls[k]=v.strip()
            for sel in prelude.split(','):
                out.append((tuple(stack), sel.strip(), decls))
            i=j; continue
        if ch == '}':
            if stack: stack.pop()
            buf=''; i+=1; continue
        buf+=ch; i+=1
    return out

def theme_vars(rules, want_selectors, want_media=lambda m: True):
    """collect --vars from rules whose selector is in want_selectors, in order"""
    v={}
    for media, sel, decls in rules:
        if sel in want_selectors and want_media(media):
            for k,val in decls.items():
                if k.startswith('--'): v[k]=val
    return v
