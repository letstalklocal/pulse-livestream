# Snapshot file
# Unset all aliases to avoid conflicts with functions
unalias -a 2>/dev/null || true
shopt -u autocd
shopt -u assoc_expand_once
shopt -u cdable_vars
shopt -u cdspell
shopt -u checkhash
shopt -u checkjobs
shopt -s checkwinsize
shopt -s cmdhist
shopt -u compat31
shopt -u compat32
shopt -u compat40
shopt -u compat41
shopt -u compat42
shopt -u compat43
shopt -u compat44
shopt -s complete_fullquote
shopt -u direxpand
shopt -u dirspell
shopt -u dotglob
shopt -u execfail
shopt -u expand_aliases
shopt -u extdebug
shopt -s extglob
shopt -s extquote
shopt -u failglob
shopt -s force_fignore
shopt -s globasciiranges
shopt -s globskipdots
shopt -u globstar
shopt -u gnu_errfmt
shopt -u histappend
shopt -u histreedit
shopt -u histverify
shopt -u hostcomplete
shopt -u huponexit
shopt -u inherit_errexit
shopt -s interactive_comments
shopt -u lastpipe
shopt -u lithist
shopt -u localvar_inherit
shopt -u localvar_unset
shopt -s login_shell
shopt -u mailwarn
shopt -u no_empty_cmd_completion
shopt -u nocaseglob
shopt -u nocasematch
shopt -u noexpand_translation
shopt -u nullglob
shopt -s patsub_replacement
shopt -s progcomp
shopt -u progcomp_alias
shopt -s promptvars
shopt -u restricted_shell
shopt -u shift_verbose
shopt -s sourcepath
shopt -u varredir_close
shopt -u xpg_echo
# Functions
__bp_adjust_histcontrol () 
{ 
    local histcontrol;
    histcontrol="${HISTCONTROL:-}";
    histcontrol="${histcontrol//ignorespace}";
    if [[ "$histcontrol" == *"ignoreboth"* ]]; then
        histcontrol="ignoredups:${histcontrol//ignoreboth}";
    fi;
    export HISTCONTROL="$histcontrol"
}
__bp_in_prompt_command () 
{ 
    local prompt_command_array IFS='
;';
    read -rd '' -a prompt_command_array <<< "${PROMPT_COMMAND[*]:-}";
    local trimmed_arg;
    __bp_trim_whitespace trimmed_arg "${1:-}";
    local command trimmed_command;
    for command in "${prompt_command_array[@]:-}";
    do
        __bp_trim_whitespace trimmed_command "$command";
        if [[ "$trimmed_command" == "$trimmed_arg" ]]; then
            return 0;
        fi;
    done;
    return 1
}
__bp_install () 
{ 
    if [[ "${PROMPT_COMMAND[*]:-}" == *"__bp_precmd_invoke_cmd"* ]]; then
        return 1;
    fi;
    trap '__bp_preexec_invoke_exec "$_"' DEBUG;
    local prior_trap;
    prior_trap=$(sed "s/[^']*'\(.*\)'[^']*/\1/" <<< "${__bp_trap_string:-}");
    unset __bp_trap_string;
    if [[ -n "$prior_trap" ]]; then
        eval '__bp_original_debug_trap() {
          '"$prior_trap"'
        }';
        preexec_functions+=(__bp_original_debug_trap);
    fi;
    __bp_adjust_histcontrol;
    if [[ -n "${__bp_enable_subshells:-}" ]]; then
        set -o functrace > /dev/null 2>&1;
        shopt -s extdebug > /dev/null 2>&1;
    fi;
    local existing_prompt_command;
    existing_prompt_command="${PROMPT_COMMAND:-}";
    existing_prompt_command="${existing_prompt_command//$__bp_install_string/:}";
    existing_prompt_command="${existing_prompt_command//'
':'
'/'
'}";
    existing_prompt_command="${existing_prompt_command//'
':;/'
'}";
    __bp_sanitize_string existing_prompt_command "$existing_prompt_command";
    if [[ "${existing_prompt_command:-:}" == ":" ]]; then
        existing_prompt_command=;
    fi;
    PROMPT_COMMAND='__bp_precmd_invoke_cmd';
    PROMPT_COMMAND+=${existing_prompt_command:+'
'$existing_prompt_command};
    if (( BASH_VERSINFO[0] > 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] >= 1) )); then
        PROMPT_COMMAND+=('__bp_interactive_mode');
    else
        PROMPT_COMMAND+='
__bp_interactive_mode';
    fi;
    precmd_functions+=(precmd);
    preexec_functions+=(preexec);
    __bp_precmd_invoke_cmd;
    __bp_interactive_mode
}
__bp_install_after_session_init () 
{ 
    __bp_require_not_readonly PROMPT_COMMAND HISTCONTROL HISTTIMEFORMAT || return;
    local sanitized_prompt_command;
    __bp_sanitize_string sanitized_prompt_command "${PROMPT_COMMAND:-}";
    if [[ -n "$sanitized_prompt_command" ]]; then
        PROMPT_COMMAND=${sanitized_prompt_command}'
';
    fi;
    PROMPT_COMMAND+=${__bp_install_string}
}
__bp_interactive_mode () 
{ 
    __bp_preexec_interactive_mode="on"
}
__bp_precmd_invoke_cmd () 
{ 
    __bp_last_ret_value="$?" BP_PIPESTATUS=("${PIPESTATUS[@]}");
    if (( __bp_inside_precmd > 0 )); then
        return;
    fi;
    local __bp_inside_precmd=1;
    local precmd_function;
    for precmd_function in "${precmd_functions[@]}";
    do
        if type -t "$precmd_function" > /dev/null; then
            __bp_set_ret_value "$__bp_last_ret_value" "$__bp_last_argument_prev_command";
            "$precmd_function";
        fi;
    done;
    __bp_set_ret_value "$__bp_last_ret_value"
}
__bp_preexec_invoke_exec () 
{ 
    __bp_last_argument_prev_command="${1:-}";
    if (( __bp_inside_preexec > 0 )); then
        return;
    fi;
    local __bp_inside_preexec=1;
    if [[ ! -t 1 && -z "${__bp_delay_install:-}" ]]; then
        return;
    fi;
    if [[ -n "${COMP_LINE:-}" ]]; then
        return;
    fi;
    if [[ -z "${__bp_preexec_interactive_mode:-}" ]]; then
        return;
    else
        if [[ 0 -eq "${BASH_SUBSHELL:-}" ]]; then
            __bp_preexec_interactive_mode="";
        fi;
    fi;
    if __bp_in_prompt_command "${BASH_COMMAND:-}"; then
        __bp_preexec_interactive_mode="";
        return;
    fi;
    local this_command;
    this_command=$(export LC_ALL=C
HISTTIMEFORMAT='' builtin history 1 | sed '1 s/^ *[0-9][0-9]*[* ] //');
    if [[ -z "$this_command" ]]; then
        return;
    fi;
    local preexec_function;
    local preexec_function_ret_value;
    local preexec_ret_value=0;
    for preexec_function in "${preexec_functions[@]:-}";
    do
        if type -t "$preexec_function" > /dev/null; then
            __bp_set_ret_value "${__bp_last_ret_value:-}";
            "$preexec_function" "$this_command";
            preexec_function_ret_value="$?";
            if [[ "$preexec_function_ret_value" != 0 ]]; then
                preexec_ret_value="$preexec_function_ret_value";
            fi;
        fi;
    done;
    __bp_set_ret_value "$preexec_ret_value" "$__bp_last_argument_prev_command"
}
__bp_require_not_readonly () 
{ 
    local var;
    for var in "$@";
    do
        if ! ( unset "$var" 2> /dev/null ); then
            echo "bash-preexec requires write access to ${var}" 1>&2;
            return 1;
        fi;
    done
}
__bp_sanitize_string () 
{ 
    local var=${1:?} text=${2:-} sanitized;
    __bp_trim_whitespace sanitized "$text";
    sanitized=${sanitized%;};
    sanitized=${sanitized#;};
    __bp_trim_whitespace sanitized "$sanitized";
    printf -v "$var" '%s' "$sanitized"
}
__bp_set_ret_value () 
{ 
    return ${1:+"$1"}
}
__bp_trim_whitespace () 
{ 
    local var=${1:?} text=${2:-};
    text="${text#"${text%%[![:space:]]*}"}";
    text="${text%"${text##*[![:space:]]}"}";
    printf -v "$var" '%s' "$text"
}
__expand_tilde_by_ref () 
{ 
    [[ -n ${1+set} ]] || return 0;
    [[ $1 == REPLY ]] || local REPLY;
    _comp_expand_tilde "${!1-}";
    [[ $1 == REPLY ]] || printf -v "$1" "$REPLY"
}
__git_eread () 
{ 
    test -r "$1" && IFS='
' read -r "$2" < "$1"
}
__git_ps1 () 
{ 
    local exit=$?;
    local pcmode=no;
    local detached=no;
    local ps1pc_start='\u@\h:\w ';
    local ps1pc_end='\$ ';
    local printf_format=' (%s)';
    case "$#" in 
        2 | 3)
            pcmode=yes;
            ps1pc_start="$1";
            ps1pc_end="$2";
            printf_format="${3:-$printf_format}";
            PS1="$ps1pc_start$ps1pc_end"
        ;;
        0 | 1)
            printf_format="${1:-$printf_format}"
        ;;
        *)
            return $exit
        ;;
    esac;
    local ps1_expanded=yes;
    [ -z "${ZSH_VERSION-}" ] || [[ -o PROMPT_SUBST ]] || ps1_expanded=no;
    [ -z "${BASH_VERSION-}" ] || shopt -q promptvars || ps1_expanded=no;
    local repo_info rev_parse_exit_code;
    repo_info="$(git rev-parse --git-dir --is-inside-git-dir --is-bare-repository --is-inside-work-tree --short HEAD 2> /dev/null)";
    rev_parse_exit_code="$?";
    if [ -z "$repo_info" ]; then
        return $exit;
    fi;
    local short_sha="";
    if [ "$rev_parse_exit_code" = "0" ]; then
        short_sha="${repo_info##*'
'}";
        repo_info="${repo_info%'
'*}";
    fi;
    local inside_worktree="${repo_info##*'
'}";
    repo_info="${repo_info%'
'*}";
    local bare_repo="${repo_info##*'
'}";
    repo_info="${repo_info%'
'*}";
    local inside_gitdir="${repo_info##*'
'}";
    local g="${repo_info%'
'*}";
    if [ "true" = "$inside_worktree" ] && [ -n "${GIT_PS1_HIDE_IF_PWD_IGNORED-}" ] && [ "$(git config --bool bash.hideIfPwdIgnored)" != "false" ] && git check-ignore -q .; then
        return $exit;
    fi;
    local sparse="";
    if [ -z "${GIT_PS1_COMPRESSSPARSESTATE-}" ] && [ -z "${GIT_PS1_OMITSPARSESTATE-}" ] && [ "$(git config --bool core.sparseCheckout)" = "true" ]; then
        sparse="|SPARSE";
    fi;
    local r="";
    local b="";
    local step="";
    local total="";
    if [ -d "$g/rebase-merge" ]; then
        __git_eread "$g/rebase-merge/head-name" b;
        __git_eread "$g/rebase-merge/msgnum" step;
        __git_eread "$g/rebase-merge/end" total;
        r="|REBASE";
    else
        if [ -d "$g/rebase-apply" ]; then
            __git_eread "$g/rebase-apply/next" step;
            __git_eread "$g/rebase-apply/last" total;
            if [ -f "$g/rebase-apply/rebasing" ]; then
                __git_eread "$g/rebase-apply/head-name" b;
                r="|REBASE";
            else
                if [ -f "$g/rebase-apply/applying" ]; then
                    r="|AM";
                else
                    r="|AM/REBASE";
                fi;
            fi;
        else
            if [ -f "$g/MERGE_HEAD" ]; then
                r="|MERGING";
            else
                if __git_sequencer_status; then
                    :;
                else
                    if [ -f "$g/BISECT_LOG" ]; then
                        r="|BISECTING";
                    fi;
                fi;
            fi;
        fi;
        if [ -n "$b" ]; then
            :;
        else
            if [ -h "$g/HEAD" ]; then
                b="$(git symbolic-ref HEAD 2> /dev/null)";
            else
                local head="";
                if ! __git_eread "$g/HEAD" head; then
                    return $exit;
                fi;
                b="${head#ref: }";
                if [ "$head" = "$b" ]; then
                    detached=yes;
                    b="$(case "${GIT_PS1_DESCRIBE_STYLE-}" in 
    contains)
        git describe --contains HEAD
    ;;
    branch)
        git describe --contains --all HEAD
    ;;
    tag)
        git describe --tags HEAD
    ;;
    describe)
        git describe HEAD
    ;;
    * | default)
        git describe --tags --exact-match HEAD
    ;;
esac 2> /dev/null)" || b="$short_sha...";
                    b="($b)";
                fi;
            fi;
        fi;
    fi;
    if [ -n "$step" ] && [ -n "$total" ]; then
        r="$r $step/$total";
    fi;
    local conflict="";
    if [[ "${GIT_PS1_SHOWCONFLICTSTATE}" == "yes" ]] && [[ -n $(git ls-files --unmerged 2> /dev/null) ]]; then
        conflict="|CONFLICT";
    fi;
    local w="";
    local i="";
    local s="";
    local u="";
    local h="";
    local c="";
    local p="";
    local upstream="";
    if [ "true" = "$inside_gitdir" ]; then
        if [ "true" = "$bare_repo" ]; then
            c="BARE:";
        else
            b="GIT_DIR!";
        fi;
    else
        if [ "true" = "$inside_worktree" ]; then
            if [ -n "${GIT_PS1_SHOWDIRTYSTATE-}" ] && [ "$(git config --bool bash.showDirtyState)" != "false" ]; then
                git diff --no-ext-diff --quiet || w="*";
                git diff --no-ext-diff --cached --quiet || i="+";
                if [ -z "$short_sha" ] && [ -z "$i" ]; then
                    i="#";
                fi;
            fi;
            if [ -n "${GIT_PS1_SHOWSTASHSTATE-}" ] && git rev-parse --verify --quiet refs/stash > /dev/null; then
                s="$";
            fi;
            if [ -n "${GIT_PS1_SHOWUNTRACKEDFILES-}" ] && [ "$(git config --bool bash.showUntrackedFiles)" != "false" ] && git ls-files --others --exclude-standard --directory --no-empty-directory --error-unmatch -- ':/*' > /dev/null 2> /dev/null; then
                u="%${ZSH_VERSION+%}";
            fi;
            if [ -n "${GIT_PS1_COMPRESSSPARSESTATE-}" ] && [ "$(git config --bool core.sparseCheckout)" = "true" ]; then
                h="?";
            fi;
            if [ -n "${GIT_PS1_SHOWUPSTREAM-}" ]; then
                __git_ps1_show_upstream;
            fi;
        fi;
    fi;
    local z="${GIT_PS1_STATESEPARATOR-" "}";
    b=${b##refs/heads/};
    if [ $pcmode = yes ] && [ $ps1_expanded = yes ]; then
        __git_ps1_branch_name=$b;
        b="\${__git_ps1_branch_name}";
    fi;
    if [ -n "${GIT_PS1_SHOWCOLORHINTS-}" ]; then
        __git_ps1_colorize_gitstring;
    fi;
    local f="$h$w$i$s$u$p";
    local gitstring="$c$b${f:+$z$f}${sparse}$r${upstream}${conflict}";
    if [ $pcmode = yes ]; then
        if [ "${__git_printf_supports_v-}" != yes ]; then
            gitstring=$(printf -- "$printf_format" "$gitstring");
        else
            printf -v gitstring -- "$printf_format" "$gitstring";
        fi;
        PS1="$ps1pc_start$gitstring$ps1pc_end";
    else
        printf -- "$printf_format" "$gitstring";
    fi;
    return $exit
}
__git_ps1_colorize_gitstring () 
{ 
    if [[ -n ${ZSH_VERSION-} ]]; then
        local c_red='%F{red}';
        local c_green='%F{green}';
        local c_lblue='%F{blue}';
        local c_clear='%f';
    else
        local c_red='[31m';
        local c_green='[32m';
        local c_lblue='[1;34m';
        local c_clear='[0m';
    fi;
    local bad_color=$c_red;
    local ok_color=$c_green;
    local flags_color="$c_lblue";
    local branch_color="";
    if [ $detached = no ]; then
        branch_color="$ok_color";
    else
        branch_color="$bad_color";
    fi;
    if [ -n "$c" ]; then
        c="$branch_color$c$c_clear";
    fi;
    b="$branch_color$b$c_clear";
    if [ -n "$w" ]; then
        w="$bad_color$w$c_clear";
    fi;
    if [ -n "$i" ]; then
        i="$ok_color$i$c_clear";
    fi;
    if [ -n "$s" ]; then
        s="$flags_color$s$c_clear";
    fi;
    if [ -n "$u" ]; then
        u="$bad_color$u$c_clear";
    fi
}
__git_ps1_show_upstream () 
{ 
    local key value;
    local svn_remote svn_url_pattern count n;
    local upstream_type=git legacy="" verbose="" name="";
    svn_remote=();
    local output="$(git config -z --get-regexp '^(svn-remote\..*\.url|bash\.showupstream)$' 2> /dev/null | tr '\0\n' '\n ')";
    while read -r key value; do
        case "$key" in 
            bash.showupstream)
                GIT_PS1_SHOWUPSTREAM="$value";
                if [[ -z "${GIT_PS1_SHOWUPSTREAM}" ]]; then
                    p="";
                    return;
                fi
            ;;
            svn-remote.*.url)
                svn_remote[$((${#svn_remote[@]} + 1))]="$value";
                svn_url_pattern="$svn_url_pattern\\|$value";
                upstream_type=svn+git
            ;;
        esac;
    done <<< "$output";
    local option;
    for option in ${GIT_PS1_SHOWUPSTREAM};
    do
        case "$option" in 
            git | svn)
                upstream_type="$option"
            ;;
            verbose)
                verbose=1
            ;;
            legacy)
                legacy=1
            ;;
            name)
                name=1
            ;;
        esac;
    done;
    case "$upstream_type" in 
        git)
            upstream_type="@{upstream}"
        ;;
        svn*)
            local -a svn_upstream;
            svn_upstream=($(git log --first-parent -1 --grep="^git-svn-id: \(${svn_url_pattern#??}\)" 2> /dev/null));
            if [[ 0 -ne ${#svn_upstream[@]} ]]; then
                svn_upstream=${svn_upstream[${#svn_upstream[@]} - 2]};
                svn_upstream=${svn_upstream%@*};
                local n_stop="${#svn_remote[@]}";
                for ((n=1; n <= n_stop; n++))
                do
                    svn_upstream=${svn_upstream#${svn_remote[$n]}};
                done;
                if [[ -z "$svn_upstream" ]]; then
                    upstream_type=${GIT_SVN_ID:-git-svn};
                else
                    upstream_type=${svn_upstream#/};
                fi;
            else
                if [[ "svn+git" = "$upstream_type" ]]; then
                    upstream_type="@{upstream}";
                fi;
            fi
        ;;
    esac;
    if [[ -z "$legacy" ]]; then
        count="$(git rev-list --count --left-right "$upstream_type"...HEAD 2> /dev/null)";
    else
        local commits;
        if commits="$(git rev-list --left-right "$upstream_type"...HEAD 2> /dev/null)"; then
            local commit behind=0 ahead=0;
            for commit in $commits;
            do
                case "$commit" in 
                    "<"*)
                        ((behind++))
                    ;;
                    *)
                        ((ahead++))
                    ;;
                esac;
            done;
            count="$behind	$ahead";
        else
            count="";
        fi;
    fi;
    if [[ -z "$verbose" ]]; then
        case "$count" in 
            "")
                p=""
            ;;
            "0	0")
                p="="
            ;;
            "0	"*)
                p=">"
            ;;
            *"	0")
                p="<"
            ;;
            *)
                p="<>"
            ;;
        esac;
    else
        case "$count" in 
            "")
                upstream=""
            ;;
            "0	0")
                upstream="|u="
            ;;
            "0	"*)
                upstream="|u+${count#0	}"
            ;;
            *"	0")
                upstream="|u-${count%	0}"
            ;;
            *)
                upstream="|u+${count#*	}-${count%	*}"
            ;;
        esac;
        if [[ -n "$count" && -n "$name" ]]; then
            __git_ps1_upstream_name=$(git rev-parse --abbrev-ref "$upstream_type" 2> /dev/null);
            if [ $pcmode = yes ] && [ $ps1_expanded = yes ]; then
                upstream="$upstream \${__git_ps1_upstream_name}";
            else
                upstream="$upstream ${__git_ps1_upstream_name}";
                unset __git_ps1_upstream_name;
            fi;
        fi;
    fi
}
__git_sequencer_status () 
{ 
    local todo;
    if test -f "$g/CHERRY_PICK_HEAD"; then
        r="|CHERRY-PICKING";
        return 0;
    else
        if test -f "$g/REVERT_HEAD"; then
            r="|REVERTING";
            return 0;
        else
            if __git_eread "$g/sequencer/todo" todo; then
                case "$todo" in 
                    p[\ \	] | pick[\ \	]*)
                        r="|CHERRY-PICKING";
                        return 0
                    ;;
                    revert[\ \	]*)
                        r="|REVERTING";
                        return 0
                    ;;
                esac;
            fi;
        fi;
    fi;
    return 1
}
__load_completion () 
{ 
    _comp_load "$@"
}
__ltrim_colon_completions () 
{ 
    _comp_ltrim_colon_completions "$@"
}
__parse_options () 
{ 
    local -a _options=();
    _comp_compgen_help__parse "$1";
    printf '%s\n' "${_options[@]}"
}
_allowed_groups () 
{ 
    _comp_compgen -c "${1:-$cur}" allowed_groups
}
_allowed_users () 
{ 
    _comp_compgen -c "${1:-$cur}" allowed_users
}
_available_interfaces () 
{ 
    _comp_compgen_available_interfaces "$@"
}
_bashcomp_try_faketty () 
{ 
    _comp_try_faketty "$@"
}
_cd () 
{ 
    declare -F _comp_cmd_cd &> /dev/null || __load_completion cd;
    _comp_cmd_cd "$@"
}
_cd_devices () 
{ 
    _comp_compgen -a cd_devices
}
_command () 
{ 
    _comp_command "$@"
}
_command_offset () 
{ 
    local words;
    unset -v words;
    _comp_command_offset "$@"
}
_comp__find_original_word () 
{ 
    REPLY=$1;
    [[ -v cword && -v words ]] || return 0;
    local reassembled_offset=$1 i=0 j;
    for ((j = 0; j < reassembled_offset; j++))
    do
        local word=${words[j]};
        while [[ -n $word && i -lt ${#COMP_WORDS[@]} && $word == *"${COMP_WORDS[i]}"* ]]; do
            word=${word#*"${COMP_WORDS[i++]}"};
        done;
    done;
    REPLY=$i
}
_comp__get_cword_at_cursor () 
{ 
    local cword words=();
    _comp__reassemble_words "$1" words cword;
    local i cur="" index=$COMP_POINT lead=${COMP_LINE:0:COMP_POINT};
    if [[ $index -gt 0 && ( -n $lead && -n ${lead//[[:space:]]/} ) ]]; then
        cur=$COMP_LINE;
        for ((i = 0; i <= cword; ++i))
        do
            while [[ ${#cur} -ge ${#words[i]} && ${cur:0:${#words[i]}} != "${words[i]-}" ]]; do
                cur=${cur:1};
                ((index > 0)) && ((index--));
            done;
            if ((i < cword)); then
                local old_size=${#cur};
                cur=${cur#"${words[i]}"};
                local new_size=${#cur};
                ((index -= old_size - new_size));
            fi;
        done;
        [[ -n $cur && ! -n ${cur//[[:space:]]/} ]] && cur=;
        ((index < 0)) && index=0;
    fi;
    local IFS=' 	
';
    local "$2" "$3" "$4" && _comp_upvars -a"${#words[@]}" "$2" ${words[@]+"${words[@]}"} -v "$3" "$cword" -v "$4" "${cur:0:index}"
}
_comp__included_ssh_config_files () 
{ 
    (($# < 1)) && echo "bash_completion: $FUNCNAME: missing mandatory argument CONFIG" 1>&2;
    local configfile i files f REPLY;
    configfile=$1;
    local relative_include_base;
    if [[ $configfile == /etc/ssh* ]]; then
        relative_include_base="/etc/ssh";
    else
        relative_include_base="$HOME/.ssh";
    fi;
    local depth=1;
    local -a included;
    local -a include_files;
    included=("$configfile");
    local max_depth=16;
    while ((${#included[@]} > 0 && depth++ < max_depth)); do
        _comp_split include_files "$(command sed -ne 's/^[[:blank:]]*[Ii][Nn][Cc][Ll][Uu][Dd][Ee][[:blank:]]\(.*\)$/\1/p' "${included[@]}")" || return;
        included=();
        for i in "${include_files[@]}";
        do
            if [[ $i != [~/]* ]]; then
                i="${relative_include_base}/${i}";
            fi;
            _comp_expand_tilde "$i";
            if _comp_expand_glob files '$REPLY'; then
                for f in "${files[@]}";
                do
                    if [[ -r $f && ! -d $f ]]; then
                        config+=("$f");
                        included+=("$f");
                    fi;
                done;
            fi;
        done;
    done
}
_comp__reassemble_words () 
{ 
    local exclude="" i j line ref;
    if [[ -n $1 ]]; then
        exclude="[${1//[^$COMP_WORDBREAKS]/}]";
    fi;
    printf -v "$3" %s "$COMP_CWORD";
    if [[ -n $exclude ]]; then
        line=$COMP_LINE;
        for ((i = 0, j = 0; i < ${#COMP_WORDS[@]}; i++, j++))
        do
            while [[ $i -gt 0 && ${COMP_WORDS[i]} == +($exclude) ]]; do
                [[ $line != [[:blank:]]* ]] && ((j >= 2)) && ((j--));
                ref="$2[$j]";
                printf -v "$ref" %s "${!ref-}${COMP_WORDS[i]}";
                ((i == COMP_CWORD)) && printf -v "$3" %s "$j";
                line=${line#*"${COMP_WORDS[i]}"};
                if ((i < ${#COMP_WORDS[@]} - 1)); then
                    ((i++));
                else
                    break 2;
                fi;
                [[ $line == [[:blank:]]* ]] && ((j++));
            done;
            ref="$2[$j]";
            printf -v "$ref" %s "${!ref-}${COMP_WORDS[i]}";
            line=${line#*"${COMP_WORDS[i]}"};
            ((i == COMP_CWORD)) && printf -v "$3" %s "$j";
        done;
        ((i == COMP_CWORD)) && printf -v "$3" %s "$j";
    else
        for i in "${!COMP_WORDS[@]}";
        do
            printf -v "$2[i]" %s "${COMP_WORDS[i]}";
        done;
    fi
}
_comp__split_longopt () 
{ 
    if [[ $cur == --?*=* ]]; then
        prev=${cur%%?(\\)=*};
        cur=${cur#*=};
        return 0;
    fi;
    return 1
}
_comp_abspath () 
{ 
    REPLY=$1;
    [[ $REPLY == /* ]] || REPLY=$PWD/$REPLY;
    REPLY=${REPLY//+(\/)/\/};
    while true; do
        case $REPLY in 
            */./*)
                REPLY=${REPLY//\/.\//\/}
            ;;
            */.)
                REPLY=${REPLY%/.}
            ;;
            /..?(/*))
                REPLY=${REPLY#/..}
            ;;
            */+([^/])/../*)
                REPLY=${REPLY/\/+([^\/])\/..\//\/}
            ;;
            */+([^/])/..)
                REPLY=${REPLY%/+([^/])/..}
            ;;
            *)
                break
            ;;
        esac;
    done;
    [[ -n $REPLY ]] || REPLY=/
}
_comp_as_root () 
{ 
    [[ $EUID -eq 0 || -n ${_comp_root_command-} ]]
}
_comp_awk () 
{ 
    command awk "$@"
}
_comp_command () 
{ 
    local words;
    unset -v words;
    local offset i;
    offset=1;
    for ((i = 1; i <= COMP_CWORD; i++))
    do
        if [[ ${COMP_WORDS[i]} != -* ]]; then
            offset=$i;
            break;
        fi;
    done;
    _comp_command_offset $offset
}
_comp_command_offset () 
{ 
    local REPLY;
    _comp__find_original_word "$1";
    local word_offset=$REPLY;
    local COMP_LINE=$COMP_LINE COMP_POINT=$COMP_POINT COMP_CWORD=$COMP_CWORD;
    local -a comp_words=("${COMP_WORDS[@]}");
    local -a COMP_WORDS=("${comp_words[@]}");
    local i tail;
    for ((i = 0; i < word_offset; i++))
    do
        tail=${COMP_LINE#*"${COMP_WORDS[i]}"};
        ((COMP_POINT -= ${#COMP_LINE} - ${#tail}));
        COMP_LINE=$tail;
    done;
    COMP_WORDS=("${COMP_WORDS[@]:word_offset}");
    ((COMP_CWORD -= word_offset));
    COMPREPLY=();
    local cur;
    _comp_get_words cur;
    if ((COMP_CWORD == 0)); then
        _comp_compgen_commands;
    else
        _comp_dequote "${COMP_WORDS[0]}" || REPLY=${COMP_WORDS[0]};
        local cmd=$REPLY compcmd=$REPLY;
        local cspec=$(complete -p -- "$cmd" 2> /dev/null);
        if [[ ! -n $cspec && $cmd == */* ]]; then
            cspec=$(complete -p -- "${cmd##*/}" 2> /dev/null);
            [[ -n $cspec ]] && compcmd=${cmd##*/};
        fi;
        if [[ ! -n $cspec ]]; then
            compcmd=${cmd##*/};
            _comp_load -D -- "$compcmd";
            cspec=$(complete -p -- "$compcmd" 2> /dev/null);
        fi;
        local retry_count=0;
        while true; do
            local args original_cur=${comp_args[1]-$cur};
            if ((${#COMP_WORDS[@]} >= 2)); then
                args=("$cmd" "$original_cur" "${COMP_WORDS[-2]}");
            else
                args=("$cmd" "$original_cur");
            fi;
            if [[ ! -n $cspec ]]; then
                if ((${#COMPREPLY[@]} == 0)); then
                    _comp_complete_minimal "${args[@]}";
                fi;
            else
                if [[ $cspec == *\ -[CF]\ * ]]; then
                    if [[ $cspec == *' -F '* ]]; then
                        local func=${cspec#* -F };
                        func=${func%% *};
                        $func "${args[@]}";
                        if (($? == 124 && retry_count++ == 0)); then
                            COMPREPLY=();
                            cspec=$(complete -p -- "$compcmd" 2> /dev/null);
                            [[ -n $cspec ]] || break;
                            continue;
                        fi;
                    else
                        local completer=${cspec#* -C \'};
                        if ! _comp_dequote "'$completer"; then
                            _minimal "${args[@]}";
                            break;
                        fi;
                        completer=${REPLY[0]};
                        local -a suggestions;
                        local IFS=' 	
';
                        local reset_monitor=$(shopt -po monitor) reset_lastpipe=$(shopt -p lastpipe) reset_noglob=$(shopt -po noglob);
                        set +o monitor;
                        shopt -s lastpipe;
                        set -o noglob;
                        COMP_KEY="$COMP_KEY" COMP_LINE="$COMP_LINE" COMP_POINT="$COMP_POINT" COMP_TYPE="$COMP_TYPE" $completer "${args[@]}" | mapfile -t suggestions;
                        $reset_monitor;
                        $reset_lastpipe;
                        $reset_noglob;
                        _comp_unlocal IFS;
                        local suggestion;
                        local i=0;
                        COMPREPLY=();
                        for suggestion in "${suggestions[@]}";
                        do
                            COMPREPLY[i]+=${COMPREPLY[i]+'
'}$suggestion;
                            if [[ $suggestion != *\\ ]]; then
                                ((i++));
                            fi;
                        done;
                    fi;
                    local opt;
                    while [[ $cspec == *" -o "* ]]; do
                        cspec=${cspec#*-o };
                        opt=${cspec%% *};
                        compopt -o "$opt";
                        cspec=${cspec#"$opt"};
                    done;
                else
                    cspec=${cspec#complete};
                    cspec=${cspec%%@("$compcmd"|"'${compcmd//\'/\'\\\'\'}'")};
                    eval "_comp_compgen -- $cspec";
                fi;
            fi;
            break;
        done;
    fi
}
_comp_compgen () 
{ 
    local _append=;
    local _var=;
    local _cur=${_comp_compgen__cur-${cur-}};
    local _dir="";
    local _ifs=' 	
' _has_ifs="";
    local _icmd="" _xcmd="";
    local -a _upvars=();
    local _old_nocasematch="";
    if shopt -q nocasematch; then
        _old_nocasematch=set;
        shopt -u nocasematch;
    fi;
    local OPTIND=1 OPTARG="" OPTERR=0 _opt;
    while getopts ':av:U:Rc:C:lF:i:x:' _opt "$@"; do
        case $_opt in 
            a)
                _append=set
            ;;
            v)
                if [[ $OPTARG == @(*[^_a-zA-Z0-9]*|[0-9]*|''|_*|IFS|OPTIND|OPTARG|OPTERR|cur) ]]; then
                    printf 'bash_completion: %s: -v: invalid array name `%s'\''\n' "$FUNCNAME" "$OPTARG" 1>&2;
                    return 2;
                fi;
                _var=$OPTARG
            ;;
            U)
                if [[ $OPTARG == @(*[^_a-zA-Z0-9]*|[0-9]*|'') ]]; then
                    printf 'bash_completion: %s: -U: invalid variable name `%s'\''\n' "$FUNCNAME" "$OPTARG" 1>&2;
                    return 2;
                else
                    if [[ $OPTARG == @(_*|IFS|OPTIND|OPTARG|OPTERR|cur) ]]; then
                        printf 'bash_completion: %s: -U: unnecessary to mark `%s'\'' as upvar\n' "$FUNCNAME" "$OPTARG" 1>&2;
                        return 2;
                    fi;
                fi;
                _upvars+=("$OPTARG")
            ;;
            c)
                _cur=$OPTARG
            ;;
            R)
                _cur=""
            ;;
            C)
                if [[ ! -n $OPTARG ]]; then
                    printf 'bash_completion: %s: -C: invalid directory name `%s'\''\n' "$FUNCNAME" "$OPTARG" 1>&2;
                    return 2;
                fi;
                _dir=$OPTARG
            ;;
            l)
                _has_ifs=set _ifs='
'
            ;;
            F)
                _has_ifs=set _ifs=$OPTARG
            ;;
            [ix])
                if [[ ! -n $OPTARG ]]; then
                    printf 'bash_completion: %s: -%s: invalid command name `%s'\''\n' "$FUNCNAME" "$_opt" "$OPTARG" 1>&2;
                    return 2;
                else
                    if [[ -n $_icmd ]]; then
                        printf 'bash_completion: %s: -%s: `-i %s'\'' is already specified\n' "$FUNCNAME" "$_opt" "$_icmd" 1>&2;
                        return 2;
                    else
                        if [[ -n $_xcmd ]]; then
                            printf 'bash_completion: %s: -%s: `-x %s'\'' is already specified\n' "$FUNCNAME" "$_opt" "$_xcmd" 1>&2;
                            return 2;
                        fi;
                    fi;
                fi
            ;;&
            i)
                _icmd=$OPTARG
            ;;
            x)
                _xcmd=$OPTARG
            ;;
            *)
                printf 'bash_completion: %s: usage error\n' "$FUNCNAME" 1>&2;
                return 2
            ;;
        esac;
    done;
    [[ -n $_old_nocasematch ]] && shopt -s nocasematch;
    shift "$((OPTIND - 1))";
    if (($# == 0)); then
        printf 'bash_completion: %s: unexpected number of arguments\n' "$FUNCNAME" 1>&2;
        printf 'usage: %s [-alR|-F SEP|-v ARR|-c CUR] -- ARGS...' "$FUNCNAME" 1>&2;
        return 2;
    fi;
    if [[ ! -n $_var ]]; then
        _var=${_comp_compgen__var-COMPREPLY};
        [[ -n $_append ]] || _append=${_comp_compgen__append-};
    fi;
    if [[ $1 != -* ]]; then
        if [[ -n $_has_ifs ]]; then
            printf 'bash_completion: %s: `-l'\'' and `-F sep'\'' are not supported for generators\n' "$FUNCNAME" 1>&2;
            return 2;
        fi;
        local -a _generator;
        if [[ -n $_icmd ]]; then
            _generator=("_comp_cmd_${_icmd//[^a-zA-Z0-9_]/_}__compgen_$1");
        else
            if [[ -n $_xcmd ]]; then
                _generator=(_comp_xfunc "$_xcmd" "compgen_$1");
            else
                _generator=("_comp_compgen_$1");
            fi;
        fi;
        if ! declare -F -- "${_generator[0]}" &> /dev/null; then
            printf 'bash_completion: %s: unrecognized generator `%s'\'' (function %s not found)\n' "$FUNCNAME" "$1" "${_generator[0]}" 1>&2;
            return 2;
        fi;
        shift;
        _comp_compgen__call_generator "$@";
    else
        if [[ -n $_icmd || -n $_xcmd ]]; then
            printf 'bash_completion: %s: generator name is unspecified for `%s'\''\n' "$FUNCNAME" "${_icmd:+-i $_icmd}${_xcmd:+x $_xcmd}" 1>&2;
            return 2;
        fi;
        local IFS=' 	
';
        if [[ $* == *\$[0-9]* || $* == *\$\{[0-9]* ]]; then
            printf 'bash_completion: %s: positional parameter $1, $2, ... do not work inside this function\n' "$FUNCNAME" 1>&2;
            return 2;
        fi;
        _comp_compgen__call_builtin "$@";
    fi
}
_comp_compgen__call_builtin () 
{ 
    local _result;
    _result=$(if [[ -n $_dir ]]; then
    command cd -- "$_dir" &> /dev/null || return;
fi
IFS=$_ifs compgen "$@" ${_cur:+-- "$_cur"}) || { 
        _comp_compgen__error_fallback;
        return
    };
    ((${#_upvars[@]})) && _comp_unlocal "${_upvars[@]}";
    _comp_split -l ${_append:+-a} "$_var" "$_result"
}
_comp_compgen__call_generator () 
{ 
    ((${#_upvars[@]})) && _comp_unlocal "${_upvars[@]}";
    if [[ -n $_dir ]]; then
        local _original_pwd=$PWD;
        local PWD=${PWD-} OLDPWD=${OLDPWD-};
        command cd -- "$_dir" &> /dev/null || { 
            _comp_compgen__error_fallback;
            return
        };
    fi;
    local _comp_compgen__append=$_append;
    local _comp_compgen__var=$_var;
    local _comp_compgen__cur=$_cur cur=$_cur;
    "${_generator[@]}" "$@";
    local _status=$?;
    [[ -n $_dir ]] && command cd -- "$_original_pwd";
    return "$_status"
}
_comp_compgen__error_fallback () 
{ 
    local _status=$?;
    if [[ -n $_append ]]; then
        eval -- "$_var+=()";
    else
        eval -- "$_var=()";
    fi;
    return "$_status"
}
_comp_compgen_allowed_groups () 
{ 
    if _comp_as_root; then
        _comp_compgen -- -g;
    else
        _comp_compgen_split -- "$(id -Gn 2> /dev/null || groups 2> /dev/null)";
    fi
}
_comp_compgen_allowed_users () 
{ 
    if _comp_as_root; then
        _comp_compgen -- -u;
    else
        _comp_compgen_split -- "$(id -un 2> /dev/null || whoami 2> /dev/null)";
    fi
}
_comp_compgen_available_interfaces () 
{ 
    local PATH=$PATH:/sbin;
    local generated;
    _comp_compgen -v generated split -- "$({ if [[ ${1-} == -w ]]; then
    iwconfig;
else
    if [[ ${1-} == -a ]]; then
        ip -c=never link show up || ip link show up || ifconfig;
    else
        ip -c=never link show || ip link show || ifconfig -a;
    fi;
fi; } 2> /dev/null | _comp_awk '/^[^ \t]/ { if ($1 ~ /^[0-9]+:/) { print $2 } else { print $1 } }')" && _comp_compgen -U generated set "${generated[@]%:}"
}
_comp_compgen_cd_devices () 
{ 
    _comp_compgen -c "${cur:-/dev/}" -- -f -d -X "!*/?([amrs])cd!(c-*)"
}
_comp_compgen_commands () 
{ 
    [[ ! -n ${cur-} ]] && shopt -q no_empty_cmd_completion && return 1;
    _comp_compgen -- -c -o plusdirs && compopt -o filenames
}
_comp_compgen_configured_interfaces () 
{ 
    local -a files;
    if [[ -f /etc/debian_version ]]; then
        _comp_expand_glob files '/etc/network/interfaces /etc/network/interfaces.d/*' || return 0;
        _comp_compgen -U files split -- "$(command sed -ne 's|^iface \([^ ]\{1,\}\).*$|\1|p' "${files[@]}" 2> /dev/null)";
    else
        if [[ -f /etc/SuSE-release ]]; then
            _comp_expand_glob files '/etc/sysconfig/network/ifcfg-*' || return 0;
            _comp_compgen -U files split -- "$(printf '%s\n' "${files[@]}" | command sed -ne 's|.*ifcfg-\([^*].*\)$|\1|p')";
        else
            if [[ -f /etc/pld-release ]]; then
                _comp_compgen -U files split -- "$(command ls -B /etc/sysconfig/interfaces | command sed -ne 's|.*ifcfg-\([^*].*\)$|\1|p')";
            else
                _comp_expand_glob files '/etc/sysconfig/network-scripts/ifcfg-*' || return 0;
                _comp_compgen -U files split -- "$(printf '%s\n' "${files[@]}" | command sed -ne 's|.*ifcfg-\([^*].*\)$|\1|p')";
            fi;
        fi;
    fi
}
_comp_compgen_dvd_devices () 
{ 
    _comp_compgen -c "${cur:-/dev/}" -- -f -d -X "!*/?(r)dvd*"
}
_comp_compgen_filedir () 
{ 
    _comp_compgen_tilde && return;
    local -a toks;
    local _arg=${1-};
    if [[ $_arg == -d ]]; then
        _comp_compgen -v toks -- -d;
    else
        local REPLY;
        _comp_quote_compgen "${cur-}";
        local _quoted=$REPLY;
        _comp_unlocal REPLY;
        [[ $_quoted == "''" ]] && _quoted="";
        local _xspec=${_arg:+"!*.@($_arg|${_arg^^})"} _plusdirs=();
        local _opts=(-f -X "$_xspec");
        [[ -n $_xspec ]] && _plusdirs=(-o plusdirs);
        [[ -n ${BASH_COMPLETION_FILEDIR_FALLBACK-} || ! -n ${_plusdirs-} ]] || _opts+=("${_plusdirs[@]}");
        _comp_compgen -v toks -c "$_quoted" -- "${_opts[@]}";
        [[ -n ${BASH_COMPLETION_FILEDIR_FALLBACK-} && -n $_arg && ${#toks[@]} -lt 1 ]] && _comp_compgen -av toks -c "$_quoted" -- -f ${_plusdirs+"${_plusdirs[@]}"};
    fi;
    if ((${#toks[@]} != 0)); then
        if [[ $cur != ?(*/).. ]]; then
            _comp_compgen -Rv toks -- -X '?(*/)@(.|..)' -W '"${toks[@]}"';
        fi;
    fi;
    if ((${#toks[@]} != 0)); then
        compopt -o filenames 2> /dev/null;
    fi;
    local IFS=' 	
';
    _comp_compgen -U toks set ${toks[@]+"${toks[@]}"}
}
_comp_compgen_filedir_xspec () 
{ 
    _comp_compgen_tilde && return;
    local REPLY;
    _comp_quote_compgen "$cur";
    local quoted=$REPLY;
    local xspec=${_comp_xspecs[${1##*/}]-${_xspecs[${1##*/}]-}};
    local -a toks;
    _comp_compgen -v toks -c "$quoted" -- -d;
    eval xspec="${xspec}";
    local matchop=!;
    if [[ $xspec == !* ]]; then
        xspec=${xspec#!};
        matchop=@;
    fi;
    xspec="$matchop($xspec|${xspec^^})";
    _comp_compgen -av toks -c "$quoted" -- -f -X "@(|!($xspec))";
    [[ -n ${BASH_COMPLETION_FILEDIR_FALLBACK-} && ${#toks[@]} -lt 1 ]] && _comp_compgen -av toks -c "$quoted" -- -f;
    ((${#toks[@]})) || return 1;
    if [[ $cur != ?(*/).. ]]; then
        _comp_compgen -Rv toks -- -X '?(*/)@(.|..)' -W '"${toks[@]}"' || return 1;
    fi;
    compopt -o filenames;
    _comp_compgen -RU toks -- -W '"${toks[@]}"'
}
_comp_compgen_fstypes () 
{ 
    local _fss;
    if [[ -e /proc/filesystems ]]; then
        _fss="$(cut -d'	' -f2 /proc/filesystems)
             $(_comp_awk '! /\*/ { print $NF }' /etc/filesystems 2> /dev/null)";
    else
        _fss="$(_comp_awk '/^[ \t]*[^#]/ { print $3 }' /etc/fstab 2> /dev/null)
             $(_comp_awk '/^[ \t]*[^#]/ { print $3 }' /etc/mnttab 2> /dev/null)
             $(_comp_awk '/^[ \t]*[^#]/ { print $4 }' /etc/vfstab 2> /dev/null)
             $(_comp_awk '{ print $1 }' /etc/dfs/fstypes 2> /dev/null)
             $(lsvfs 2> /dev/null | _comp_awk '$1 !~ /^(Filesystem|[^a-zA-Z])/ { print $1 }')
             $([[ -d /etc/fs ]] && command ls /etc/fs)";
    fi;
    [[ -n $_fss ]] && _comp_compgen_split -- "$_fss"
}
_comp_compgen_gids () 
{ 
    if type getent &> /dev/null; then
        _comp_compgen_split -- "$(getent group | cut -d: -f3)";
    else
        if type perl &> /dev/null; then
            _comp_compgen_split -- "$(perl -e 'while (($gid) = (getgrent)[2]) { print $gid . "\n" }')";
        else
            _comp_compgen_split -- "$(cut -d: -f3 /etc/group)";
        fi;
    fi
}
_comp_compgen_help () 
{ 
    (($#)) || set -- -- --help;
    local -a _lines;
    _comp_compgen_help__get_help_lines "$@" || return "$?";
    local -a options=();
    local _line;
    for _line in "${_lines[@]}";
    do
        [[ $_line == *([[:blank:]])-* ]] || continue;
        while [[ $_line =~ ((^|[^-])-[A-Za-z0-9?][[:space:]]+)\[?[A-Z0-9]+([,_-]+[A-Z0-9]+)?(\.\.+)?\]? ]]; do
            _line=${_line/"${BASH_REMATCH[0]}"/"${BASH_REMATCH[1]}"};
        done;
        _comp_compgen_help__parse "${_line// or /, }";
    done;
    ((${#options[@]})) || return 1;
    _comp_compgen -U options -- -W '"${options[@]}"';
    return 0
}
_comp_compgen_help__get_help_lines () 
{ 
    local -a help_cmd;
    case ${1-} in 
        -)
            if (($# > 1)); then
                printf 'bash_completion: %s -: extra arguments for -\n' "${FUNCNAME[1]}" 1>&2;
                printf 'usage: %s -\n' "${FUNCNAME[1]}" 1>&2;
                printf 'usage: %s -c cmd args...\n' "${FUNCNAME[1]}" 1>&2;
                printf 'usage: %s [-- args...]\n' "${FUNCNAME[1]}" 1>&2;
                return 2;
            fi;
            help_cmd=(exec cat)
        ;;
        -c)
            if (($# < 2)); then
                printf 'bash_completion: %s -c: no command is specified\n' "${FUNCNAME[1]}" 1>&2;
                printf 'usage: %s -\n' "${FUNCNAME[1]}" 1>&2;
                printf 'usage: %s -c cmd args...\n' "${FUNCNAME[1]}" 1>&2;
                printf 'usage: %s [-- args...]\n' "${FUNCNAME[1]}" 1>&2;
                return 2;
            fi;
            help_cmd=("${@:2}")
        ;;
        --)
            shift 1
        ;&
        *)
            local REPLY;
            _comp_dequote "${comp_args[0]-}" || REPLY=${comp_args[0]-};
            help_cmd=("${REPLY:-false}" "$@")
        ;;
    esac;
    local REPLY;
    _comp_split -l REPLY "$(LC_ALL=C "${help_cmd[@]}" 2>&1)" && _lines=("${REPLY[@]}")
}
_comp_compgen_help__parse () 
{ 
    local option option2 i;
    option=;
    local -a array;
    if _comp_split -F ' 	
,/|' array "$1"; then
        for i in "${array[@]}";
        do
            case "$i" in 
                ---*)
                    break
                ;;
                --?*)
                    option=$i;
                    break
                ;;
                -?*)
                    [[ -n $option ]] || option=$i
                ;;
                *)
                    break
                ;;
            esac;
        done;
    fi;
    [[ -n $option ]] || return 1;
    if [[ $option =~ (\[((no|dont)-?)\]). ]]; then
        option2=${option/"${BASH_REMATCH[1]}"/};
        option2=${option2%%[<{().[]*};
        options+=("${option2/=*/=}");
        option=${option/"${BASH_REMATCH[1]}"/"${BASH_REMATCH[2]}"};
    fi;
    [[ $option =~ ^([^=<{().[]|\.[A-Za-z0-9])+=? ]] && options+=("$BASH_REMATCH")
}
_comp_compgen_inserted_kernel_modules () 
{ 
    _comp_compgen -c "${1:-$cur}" split -- "$(PATH="$PATH:/sbin" lsmod | _comp_awk '{if (NR != 1) print $1}')"
}
_comp_compgen_ip_addresses () 
{ 
    local _n;
    case ${1-} in 
        -a)
            _n='6\{0,1\}'
        ;;
        -6)
            _n='6'
        ;;
        *)
            _n=
        ;;
    esac;
    local PATH=$PATH:/sbin;
    local addrs;
    _comp_compgen -v addrs split -- "$({ ip -c=never addr show || ip addr show || LC_ALL=C ifconfig -a; } 2> /dev/null | command sed -e 's/[[:space:]]addr:/ /' -ne "s|.*inet${_n}[[:space:]]\{1,\}\([^[:space:]/]*\).*|\1|p")" || return;
    if [[ ! -n $_n ]]; then
        _comp_compgen -U addrs set "${addrs[@]}";
    else
        _comp_compgen -U addrs ltrim_colon "${addrs[@]}";
    fi
}
_comp_compgen_kernel_modules () 
{ 
    local _modpath=/lib/modules/$1;
    _comp_compgen_split -- "$(command ls -RL "$_modpath" 2> /dev/null | command sed -ne 's/^\(.*\)\.k\{0,1\}o\(\.[gx]z\)\{0,1\}$/\1/p' -e 's/^\(.*\)\.ko\.zst$/\1/p')"
}
_comp_compgen_kernel_versions () 
{ 
    _comp_compgen_split -- "$(command ls /lib/modules)"
}
_comp_compgen_known_hosts () 
{ 
    local known_hosts;
    _comp_compgen_known_hosts__impl "$@" || return "$?";
    _comp_compgen -U known_hosts set "${known_hosts[@]}"
}
_comp_compgen_known_hosts__impl () 
{ 
    known_hosts=();
    local configfile="" flag prefix="";
    local cur suffix="" aliases="" i host ipv4="" ipv6="";
    local -a kh tmpkh=() khd=() config=();
    local OPTIND=1;
    while getopts "ac46F:p:" flag "$@"; do
        case $flag in 
            a)
                aliases=set
            ;;
            c)
                suffix=':'
            ;;
            F)
                if [[ ! -n $OPTARG ]]; then
                    echo "bash_completion: $FUNCNAME: -F: an empty filename is specified" 1>&2;
                    return 2;
                fi;
                configfile=$OPTARG
            ;;
            p)
                prefix=$OPTARG
            ;;
            4)
                ipv4=set
            ;;
            6)
                ipv6=set
            ;;
            *)
                echo "bash_completion: $FUNCNAME: usage error" 1>&2;
                return 2
            ;;
        esac;
    done;
    if (($# < OPTIND)); then
        echo "bash_completion: $FUNCNAME: missing mandatory argument CWORD" 1>&2;
        return 2;
    fi;
    cur=${!OPTIND};
    ((OPTIND += 1));
    if (($# >= OPTIND)); then
        echo "bash_completion: $FUNCNAME($*): unprocessed arguments:" "$(while (($# >= OPTIND)); do
    printf '%s ' ${!OPTIND}
shift;
done)" 1>&2;
        return 2;
    fi;
    [[ $cur == *@* ]] && prefix=$prefix${cur%@*}@ && cur=${cur#*@};
    kh=();
    if [[ -n $configfile ]]; then
        [[ -r $configfile && ! -d $configfile ]] && config+=("$configfile");
    else
        for i in /etc/ssh/ssh_config ~/.ssh/config ~/.ssh2/config;
        do
            [[ -r $i && ! -d $i ]] && config+=("$i");
        done;
    fi;
    if ((${#config[@]} > 0)); then
        for i in "${config[@]}";
        do
            _comp__included_ssh_config_files "$i";
        done;
    fi;
    if ((${#config[@]} > 0)); then
        if _comp_split -l tmpkh "$(_comp_awk 'sub("^[ \t]*([Gg][Ll][Oo][Bb][Aa][Ll]|[Uu][Ss][Ee][Rr])[Kk][Nn][Oo][Ww][Nn][Hh][Oo][Ss][Tt][Ss][Ff][Ii][Ll][Ee][ \t=]+", "") { print $0 }' "${config[@]}" | sort -u)"; then
            local tmpkh2 j REPLY;
            for i in "${tmpkh[@]}";
            do
                while [[ $i =~ ^([^\"]*)\"([^\"]*)\"(.*)$ ]]; do
                    i=${BASH_REMATCH[1]}${BASH_REMATCH[3]};
                    _comp_expand_tilde "${BASH_REMATCH[2]}";
                    [[ -r $REPLY ]] && kh+=("$REPLY");
                done;
                _comp_split tmpkh2 "$i" || continue;
                for j in "${tmpkh2[@]}";
                do
                    _comp_expand_tilde "$j";
                    [[ -r $REPLY ]] && kh+=("$REPLY");
                done;
            done;
        fi;
    fi;
    if [[ ! -n $configfile ]]; then
        for i in /etc/ssh/ssh_known_hosts /etc/ssh/ssh_known_hosts2 /etc/known_hosts /etc/known_hosts2 ~/.ssh/known_hosts ~/.ssh/known_hosts2;
        do
            [[ -r $i && ! -d $i ]] && kh+=("$i");
        done;
        for i in /etc/ssh2/knownhosts ~/.ssh2/hostkeys;
        do
            [[ -d $i ]] || continue;
            _comp_expand_glob tmpkh '"$i"/*.pub' && khd+=("${tmpkh[@]}");
        done;
    fi;
    if ((${#kh[@]} + ${#khd[@]} > 0)); then
        if ((${#kh[@]} > 0)); then
            for i in "${kh[@]}";
            do
                while read -ra tmpkh; do
                    ((${#tmpkh[@]} == 0)) && continue;
                    [[ ${tmpkh[0]} == [\|\#]* ]] && continue;
                    local host_list=${tmpkh[0]};
                    [[ ${tmpkh[0]} == @* ]] && host_list=${tmpkh[1]-};
                    local -a hosts;
                    if _comp_split -F , hosts "$host_list"; then
                        for host in "${hosts[@]}";
                        do
                            [[ $host == *[*?]* ]] && continue;
                            host=${host#[};
                            host=${host%]?(:+([0-9]))};
                            [[ -n $host ]] && known_hosts+=("$host");
                        done;
                    fi;
                done < "$i";
            done;
        fi;
        if ((${#khd[@]} > 0)); then
            for i in "${khd[@]}";
            do
                if [[ $i == *key_22_*.pub && -r $i ]]; then
                    host=${i/#*key_22_/};
                    host=${host/%.pub/};
                    [[ -n $host ]] && known_hosts+=("$host");
                fi;
            done;
        fi;
        ((${#known_hosts[@]})) && _comp_compgen -v known_hosts -- -W '"${known_hosts[@]}"' -P "$prefix" -S "$suffix";
    fi;
    if [[ ${#config[@]} -gt 0 && -n $aliases ]]; then
        local -a hosts;
        if _comp_split hosts "$(command sed -ne 's/^[[:blank:]]*[Hh][Oo][Ss][Tt][[:blank:]=]\{1,\}\(.*\)$/\1/p' "${config[@]}")"; then
            _comp_compgen -av known_hosts -- -P "$prefix" -S "$suffix" -W '"${hosts[@]%%[*?%]*}"' -X '@(\!*|)';
        fi;
    fi;
    if [[ -n ${BASH_COMPLETION_KNOWN_HOSTS_WITH_AVAHI-} ]] && type avahi-browse &> /dev/null; then
        local generated=$(avahi-browse -cprak 2> /dev/null | _comp_awk -F ';' '/^=/ && $5 ~ /^_(ssh|workstation)\._tcp$/ { print $7 }' | sort -u);
        _comp_compgen -av known_hosts -- -P "$prefix" -S "$suffix" -W '$generated';
    fi;
    if type ruptime &> /dev/null; then
        local generated=$(ruptime 2> /dev/null | _comp_awk '!/^ruptime:/ { print $1 }');
        _comp_compgen -av known_hosts -- -W '$generated';
    fi;
    if [[ -n ${BASH_COMPLETION_KNOWN_HOSTS_WITH_HOSTFILE-set} ]]; then
        _comp_compgen -av known_hosts -- -A hostname -P "$prefix" -S "$suffix";
    fi;
    ((${#known_hosts[@]})) || return 1;
    if [[ -n $ipv4 ]]; then
        known_hosts=("${known_hosts[@]/*:*$suffix/}");
    fi;
    if [[ -n $ipv6 ]]; then
        known_hosts=("${known_hosts[@]/+([0-9]).+([0-9]).+([0-9]).+([0-9])$suffix/}");
    fi;
    if [[ -n $ipv4 || -n $ipv6 ]]; then
        for i in "${!known_hosts[@]}";
        do
            [[ -n ${known_hosts[i]} ]] || unset -v 'known_hosts[i]';
        done;
    fi;
    ((${#known_hosts[@]})) || return 1;
    _comp_compgen -v known_hosts -c "$prefix$cur" ltrim_colon "${known_hosts[@]}"
}
_comp_compgen_ltrim_colon () 
{ 
    (($#)) || return 0;
    local -a _tmp;
    _tmp=("$@");
    if [[ $cur == *:* && $COMP_WORDBREAKS == *:* ]]; then
        local _colon_word=${cur%"${cur##*:}"};
        _tmp=("${_tmp[@]#"$_colon_word"}");
    fi;
    _comp_compgen_set "${_tmp[@]}"
}
_comp_compgen_mac_addresses () 
{ 
    local _re='\([A-Fa-f0-9]\{2\}:\)\{5\}[A-Fa-f0-9]\{2\}';
    local PATH="$PATH:/sbin:/usr/sbin";
    local -a addresses;
    _comp_compgen -v addresses split -- "$({ ip -c=never link show || ip link show || LC_ALL=C ifconfig -a; } 2> /dev/null | command sed -ne "s/.*[[:space:]]HWaddr[[:space:]]\{1,\}\($_re\)[[:space:]].*/\1/p" -ne "s/.*[[:space:]]HWaddr[[:space:]]\{1,\}\($_re\)[[:space:]]*$/\1/p" -ne "s|.*[[:space:]]\(link/\)\{0,1\}ether[[:space:]]\{1,\}\($_re\)[[:space:]].*|\2|p" -ne "s|.*[[:space:]]\(link/\)\{0,1\}ether[[:space:]]\{1,\}\($_re\)[[:space:]]*$|\2|p")";
    _comp_compgen -av addresses split -- "$({ arp -an || ip -c=never neigh show || ip neigh show; } 2> /dev/null | command sed -ne "s/.*[[:space:]]\($_re\)[[:space:]].*/\1/p" -ne "s/.*[[:space:]]\($_re\)[[:space:]]*$/\1/p")";
    _comp_compgen -av addresses split -- "$(command sed -ne "s/^[[:space:]]*\($_re\)[[:space:]].*/\1/p" /etc/ethers 2> /dev/null)";
    _comp_compgen -U addresses ltrim_colon "${addresses[@]}"
}
_comp_compgen_pci_ids () 
{ 
    _comp_compgen_split -- "$(PATH="$PATH:/sbin" lspci -n | _comp_awk '{print $3}')"
}
_comp_compgen_pgids () 
{ 
    _comp_compgen_split -- "$(command ps ax -o pgid=)"
}
_comp_compgen_pids () 
{ 
    _comp_compgen_split -- "$(command ps ax -o pid=)"
}
_comp_compgen_pnames () 
{ 
    local -a procs=();
    if [[ ${1-} == -s ]]; then
        _comp_split procs "$(command ps ax -o comm | command sed -e 1d)";
    else
        local -a psout;
        _comp_split -l psout "$({ command ps ax -o command= || command ps ax -o comm=; } 2> /dev/null)";
        local line i=-1;
        for line in "${psout[@]}";
        do
            if ((i == -1)); then
                if [[ $line =~ ^(.*[[:space:]])COMMAND([[:space:]]|$) ]]; then
                    i=${#BASH_REMATCH[1]};
                else
                    break;
                fi;
            else
                line=${line:i};
                line=${line%% *};
                [[ -n $line ]] && procs+=("$line");
            fi;
        done;
        if ((i == -1)); then
            for line in "${psout[@]}";
            do
                if [[ $line =~ ^[[(](.+)[])]$ ]]; then
                    procs+=("${BASH_REMATCH[1]}");
                else
                    line=${line%% *};
                    line=${line##@(*/|-)};
                    [[ -n $line ]] && procs+=("$line");
                fi;
            done;
        fi;
    fi;
    ((${#procs[@]})) && _comp_compgen -U procs -- -X "<defunct>" -W '"${procs[@]}"'
}
_comp_compgen_selinux_users () 
{ 
    _comp_compgen_split -- "$(semanage user -nl 2> /dev/null | _comp_awk '{ print $1 }')"
}
_comp_compgen_services () 
{ 
    local sysvdirs;
    _comp_sysvdirs || return 1;
    local services;
    _comp_expand_glob services '${sysvdirs[0]}/!($_comp_backup_glob|functions|README)';
    local _generated=$({ systemctl list-units --full --all || systemctl list-unit-files; } 2> /dev/null | _comp_awk '$1 ~ /\.service$/ { sub("\\.service$", "", $1); print $1 }');
    _comp_split -la services "$_generated";
    if [[ -x /sbin/upstart-udev-bridge ]]; then
        _comp_split -la services "$(initctl list 2> /dev/null | cut -d' ' -f1)";
    fi;
    ((${#services[@]})) || return 1;
    _comp_compgen -U services -U sysvdirs -- -W '"${services[@]#${sysvdirs[0]}/}"'
}
_comp_compgen_set () 
{ 
    local _append=${_comp_compgen__append-};
    local _var=${_comp_compgen__var-COMPREPLY};
    eval -- "$_var${_append:++}=(\"\$@\")";
    (($#))
}
_comp_compgen_shells () 
{ 
    local -a shells=();
    local _shell _rest;
    while read -r _shell _rest; do
        [[ $_shell == /* ]] && shells+=("$_shell");
    done 2> /dev/null < "${1-}"/etc/shells;
    _comp_compgen -U shells -- -W '"${shells[@]}"'
}
_comp_compgen_signals () 
{ 
    local -a sigs;
    _comp_compgen -v sigs -c "SIG${cur#"${1-}"}" -- -A signal && _comp_compgen -RU sigs -- -P "${1-}" -W '"${sigs[@]#SIG}"'
}
_comp_compgen_split () 
{ 
    local _ifs=' 	
';
    local -a _compgen_options=();
    local OPTIND=1 OPTARG="" OPTERR=0 _opt;
    while getopts ':lF:X:S:P:o:' _opt "$@"; do
        case $_opt in 
            l)
                _ifs='
'
            ;;
            F)
                _ifs=$OPTARG
            ;;
            [XSPo])
                _compgen_options+=("-$_opt" "$OPTARG")
            ;;
            *)
                printf 'bash_completion: usage: %s [-l|-F sep] [--] str\n' "$FUNCNAME" 1>&2;
                return 2
            ;;
        esac;
    done;
    shift "$((OPTIND - 1))";
    if (($# != 1)); then
        printf 'bash_completion: %s: unexpected number of arguments.\n' "$FUNCNAME" 1>&2;
        printf 'usage: %s [-l|-F sep] [--] str' "$FUNCNAME" 1>&2;
        return 2;
    fi;
    local input=$1 IFS=' 	
';
    _comp_compgen -F "$_ifs" -U input -- ${_compgen_options[@]+"${_compgen_options[@]}"} -W '$input'
}
_comp_compgen_terms () 
{ 
    _comp_compgen_split -- "$({ command sed -ne 's/^\([^[:space:]#|]\{2,\}\)|.*/\1/p' /etc/termcap
{ toe -a || toe; } | _comp_awk '{ print $1 }'
_comp_expand_glob dirs '/{etc,lib,usr/lib,usr/share}/terminfo/?' && find "${dirs[@]}" -type f -maxdepth 1 | _comp_awk -F / '{ print $NF }'; } 2> /dev/null)"
}
_comp_compgen_tilde () 
{ 
    if [[ ${cur-} == \~* && $cur != */* ]]; then
        if _comp_compgen -c "${cur#\~}" -- -P '~' -u; then
            compopt -o filenames 2> /dev/null;
            return 0;
        fi;
    fi;
    return 1
}
_comp_compgen_uids () 
{ 
    if type getent &> /dev/null; then
        _comp_compgen_split -- "$(getent passwd | cut -d: -f3)";
    else
        if type perl &> /dev/null; then
            _comp_compgen_split -- "$(perl -e 'while (($uid) = (getpwent)[2]) { print $uid . "\n" }')";
        else
            _comp_compgen_split -- "$(cut -d: -f3 /etc/passwd)";
        fi;
    fi
}
_comp_compgen_usage () 
{ 
    (($#)) || set -- -- --usage;
    local -a _lines;
    _comp_compgen_help__get_help_lines "$@" || return "$?";
    local -a options=();
    local _line _match _option _i _char;
    for _line in "${_lines[@]}";
    do
        while [[ $_line =~ \[[[:space:]]*(-[^]]+)[[:space:]]*\] ]]; do
            _match=${BASH_REMATCH[0]};
            _option=${BASH_REMATCH[1]};
            case $_option in 
                -?(\[)+([a-zA-Z0-9?]))
                    for ((_i = 1; _i < ${#_option}; _i++))
                    do
                        _char=${_option:_i:1};
                        [[ $_char != '[' ]] && options+=("-$_char");
                    done
                ;;
                *)
                    _comp_compgen_help__parse "$_option"
                ;;
            esac;
            _line=${_line#*"$_match"};
        done;
    done;
    ((${#options[@]})) || return 1;
    _comp_compgen -U options -- -W '"${options[@]}"';
    return 0
}
_comp_compgen_usb_ids () 
{ 
    _comp_compgen_split -- "$(PATH="$PATH:/sbin" lsusb | _comp_awk '{print $6}')"
}
_comp_compgen_usergroups () 
{ 
    if [[ $cur == *\\\\* || $cur == *:*:* ]]; then
        return;
    else
        if [[ $cur == *\\:* ]]; then
            local tmp;
            if [[ ${1-} == -u ]]; then
                _comp_compgen -v tmp -c "${cur#*:}" allowed_groups;
            else
                _comp_compgen -v tmp -c "${cur#*:}" -- -g;
            fi;
            if ((${#tmp[@]})); then
                local _prefix=${cur%%*([^:])};
                _prefix=${_prefix//\\/};
                _comp_compgen -Rv tmp -- -P "$_prefix" -W '"${tmp[@]}"';
                _comp_compgen -U tmp set "${tmp[@]}";
            fi;
        else
            if [[ $cur == *:* ]]; then
                if [[ ${1-} == -u ]]; then
                    _comp_compgen -c "${cur#*:}" allowed_groups;
                else
                    _comp_compgen -c "${cur#*:}" -- -g;
                fi;
            else
                if [[ ${1-} == -u ]]; then
                    _comp_compgen_allowed_users;
                else
                    _comp_compgen -- -u;
                fi;
            fi;
        fi;
    fi
}
_comp_compgen_variables () 
{ 
    if [[ $cur =~ ^(\$(\{[!#]?)?)([A-Za-z0-9_]*)$ ]]; then
        if [[ $cur == '${'* ]]; then
            local arrs vars;
            _comp_compgen -v vars -c "${BASH_REMATCH[3]}" -- -A variable -P "${BASH_REMATCH[1]}" -S '}';
            _comp_compgen -v arrs -c "${BASH_REMATCH[3]}" -- -A arrayvar -P "${BASH_REMATCH[1]}" -S '[';
            if ((${#vars[@]} == 1 && ${#arrs[@]} != 0)); then
                compopt -o nospace;
                _comp_compgen -U vars -U arrs -R -- -W '"${arrs[@]}"';
            else
                _comp_compgen -U vars -U arrs -R -- -W '"${vars[@]}"';
            fi;
        else
            _comp_compgen -ac "${BASH_REMATCH[3]}" -- -A variable -P '$';
        fi;
        return 0;
    else
        if [[ $cur =~ ^(\$\{[#!]?)([A-Za-z0-9_]*)\[([^]]*)$ ]]; then
            local vars;
            _comp_compgen -v vars -c "${BASH_REMATCH[3]}" -- -W '"${!'"${BASH_REMATCH[2]}"'[@]}"' -P "${BASH_REMATCH[1]}${BASH_REMATCH[2]}[" -S ']}';
            if [[ ${BASH_REMATCH[3]} == [@*] ]]; then
                vars+=("${BASH_REMATCH[1]}${BASH_REMATCH[2]}[${BASH_REMATCH[3]}]}");
            fi;
            if ((${#vars[@]})); then
                _comp_compgen -U vars -c "$cur" ltrim_colon "${vars[@]}";
            else
                _comp_compgen_set;
            fi;
            return 0;
        else
            if [[ $cur =~ ^\$\{[#!]?[A-Za-z0-9_]*\[.*\]$ ]]; then
                _comp_compgen -c "$cur" ltrim_colon "$cur}";
                return 0;
            fi;
        fi;
    fi;
    return 1
}
_comp_compgen_xinetd_services () 
{ 
    local xinetddir=${_comp__test_xinetd_dir:-/etc/xinetd.d};
    if [[ -d $xinetddir ]]; then
        local -a svcs;
        if _comp_expand_glob svcs '$xinetddir/!($_comp_backup_glob)'; then
            _comp_compgen -U svcs -U xinetddir -- -W '"${svcs[@]#$xinetddir/}"';
        fi;
    fi
}
_comp_complete_filedir_xspec () 
{ 
    local cur prev words cword comp_args;
    _comp_initialize -- "$@" || return;
    _comp_compgen_filedir_xspec "$1"
}
_comp_complete_known_hosts () 
{ 
    local cur prev words cword comp_args;
    _comp_initialize -n : -- "$@" || return;
    local -a options=();
    [[ ${1-} == -a || ${2-} == -a ]] && options+=(-a);
    [[ ${1-} == -c || ${2-} == -c ]] && options+=(-c);
    local IFS=' 	
';
    _comp_compgen_known_hosts ${options[@]+"${options[@]}"} -- "$cur"
}
_comp_complete_load () 
{ 
    local cmd=${1:-_EmptycmD_};
    _comp_load -D -- "$cmd" && return 124
}
_comp_complete_longopt () 
{ 
    local cur prev words cword was_split comp_args;
    _comp_initialize -s -- "$@" || return;
    case "${prev,,}" in 
        --help | --usage | --version)
            return
        ;;
        --!(no-*)dir*)
            _comp_compgen -a filedir -d;
            return
        ;;
        --!(no-*)@(file|path)*)
            _comp_compgen -a filedir;
            return
        ;;
        --+([-a-z0-9_]))
            local argtype=$(LC_ALL=C $1 --help 2>&1 | command sed -ne "s|.*$prev\[\{0,1\}=[<[]\{0,1\}\([-A-Za-z0-9_]\{1,\}\).*|\1|p");
            case ${argtype,,} in 
                *dir*)
                    _comp_compgen -a filedir -d;
                    return
                ;;
                *file* | *path*)
                    _comp_compgen -a filedir;
                    return
                ;;
            esac
        ;;
    esac;
    [[ -n $was_split ]] && return;
    if [[ $cur == -* ]]; then
        _comp_compgen_split -- "$(LC_ALL=C $1 --help 2>&1 | while read -r line; do
    [[ $line =~ --[A-Za-z0-9]+([-_][A-Za-z0-9]+)*=? ]] && printf '%s\n' "${BASH_REMATCH[0]}";
done)";
        [[ ${COMPREPLY-} == *= ]] && compopt -o nospace;
    else
        if [[ $1 == *@(rmdir|chroot) ]]; then
            _comp_compgen -a filedir -d;
        else
            [[ $1 == *mkdir ]] && compopt -o nospace;
            _comp_compgen -a filedir;
        fi;
    fi
}
_comp_complete_minimal () 
{ 
    local cur prev words cword comp_args;
    _comp_initialize -- "$@" || return;
    compopt -o bashdefault -o default
}
_comp_complete_service () 
{ 
    local cur prev words cword comp_args;
    _comp_initialize -- "$@" || return;
    ((cword > 2)) && return;
    if [[ $cword -eq 1 && $prev == ?(*/)service ]]; then
        _comp_compgen_services;
        [[ -e /etc/mandrake-release ]] && _comp_compgen_xinetd_services;
    else
        local sysvdirs;
        _comp_sysvdirs || return 1;
        _comp_compgen_split -l -- "$(command sed -e 'y/|/ /' -ne 's/^.*\(U\|msg_u\)sage.*{\(.*\)}.*$/\2/p' "${sysvdirs[0]}/${prev##*/}" 2> /dev/null) start stop";
    fi
}
_comp_complete_user_at_host () 
{ 
    local cur prev words cword comp_args;
    _comp_initialize -n : -- "$@" || return;
    if [[ $cur == *@* ]]; then
        _comp_compgen_known_hosts "$cur";
    else
        _comp_compgen -- -u -S @;
        compopt -o nospace;
    fi
}
_comp_count_args () 
{ 
    local has_optarg="" has_exclude="" exclude="" glob_include="";
    local OPTIND=1 OPTARG="" OPTERR=0 _opt;
    while getopts ':a:n:i:' _opt "$@"; do
        case $_opt in 
            a)
                has_optarg=$OPTARG
            ;;
            n)
                has_exclude=set exclude+=$OPTARG
            ;;
            i)
                glob_include=$OPTARG
            ;;
            *)
                echo "bash_completion: $FUNCNAME: usage error" 1>&2;
                return 2
            ;;
        esac;
    done;
    shift "$((OPTIND - 1))";
    if [[ -n $has_exclude ]]; then
        local cword words;
        _comp__reassemble_words "$exclude<>&" words cword;
    fi;
    local i;
    REPLY=1;
    for ((i = 1; i < cword; i++))
    do
        if [[ -n $has_optarg && ${words[i]} == $has_optarg ]]; then
            ((i++));
        else
            if [[ ${words[i]} != -?* || -n $glob_include && ${words[i]} == $glob_include ]]; then
                ((REPLY++));
            else
                if [[ ${words[i]} == -- ]]; then
                    ((REPLY += cword - i - 1));
                    break;
                fi;
            fi;
        fi;
    done
}
_comp_delimited () 
{ 
    local prefix="" delimiter=$1 deduplicate=set;
    shift;
    if [[ $delimiter == -k ]]; then
        deduplicate="";
        delimiter=$1;
        shift;
    fi;
    [[ $cur == *"$delimiter"* ]] && prefix=${cur%"$delimiter"*}$delimiter;
    if [[ -n $deduplicate ]]; then
        _comp_compgen -R -- "$@";
        local -a existing;
        _comp_split -F "$delimiter" existing "$cur";
        [[ ! -n $cur || $cur == *"$delimiter" ]] || unset -v "existing[${#existing[@]}-1]";
        if ((${#COMPREPLY[@]})); then
            local x i;
            for x in ${existing+"${existing[@]}"};
            do
                for i in "${!COMPREPLY[@]}";
                do
                    if [[ $x == "${COMPREPLY[i]}" ]]; then
                        unset -v 'COMPREPLY[i]';
                        continue 2;
                    fi;
                done;
            done;
            ((${#COMPREPLY[@]})) && _comp_compgen -c "${cur##*"$delimiter"}" -- -W '"${COMPREPLY[@]}"';
        fi;
    else
        _comp_compgen -c "${cur##*"$delimiter"}" -- "$@";
    fi;
    local i;
    for i in "${!COMPREPLY[@]}";
    do
        COMPREPLY[i]="$prefix${COMPREPLY[i]}";
    done;
    [[ $delimiter != : ]] || _comp_ltrim_colon_completions "$cur"
}
_comp_deprecate_func () 
{ 
    if (($# != 3)); then
        printf 'bash_completion: %s: usage: %s DEPRECATION_VERSION OLD_NAME NEW_NAME\n' "$FUNCNAME" "$FUNCNAME";
        return 2;
    fi;
    if [[ $2 != [a-zA-Z_]*([a-zA-Z_0-9]) ]]; then
        printf 'bash_completion: %s: %s\n' "$FUNCNAME" "\$2: invalid function name '$1'" 1>&2;
        return 2;
    else
        if [[ $3 != [a-zA-Z_]*([a-zA-Z_0-9]) ]]; then
            printf 'bash_completion: %s: %s\n' "$FUNCNAME" "\$3: invalid function name '$2'" 1>&2;
            return 2;
        fi;
    fi;
    eval -- "$2() { $3 \"\$@\"; }"
}
_comp_deprecate_var () 
{ 
    if (($# != 3)); then
        printf 'bash_completion: %s: usage: %s DEPRECATION_VERSION OLD_NAME NEW_NAME\n' "$FUNCNAME" "$FUNCNAME";
        return 2;
    fi;
    if [[ $2 != [a-zA-Z_]*([a-zA-Z_0-9]) ]]; then
        printf 'bash_completion: %s: %s\n' "$FUNCNAME" "\$2: invalid variable name '$1'" 1>&2;
        return 2;
    else
        if [[ $3 != [a-zA-Z_]*([a-zA-Z_0-9]) ]]; then
            printf 'bash_completion: %s: %s\n' "$FUNCNAME" "\$3: invalid variable name '$2'" 1>&2;
            return 2;
        fi;
    fi;
    if ((BASH_VERSINFO[0] >= 5 || BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 3)); then
        eval "declare -gn $2=$3";
    else
        if [[ -v $2 && ! -v $3 ]]; then
            printf -v "$3" %s "$2";
        fi;
    fi
}
_comp_dequote () 
{ 
    REPLY=();
    [[ $1 =~ $_comp_dequote__regex_safe_word ]] || return 1;
    eval "REPLY=($1)" 2> /dev/null
}
_comp_expand () 
{ 
    case ${cur-} in 
        ~*/*)
            local REPLY;
            _comp_expand_tilde "$cur";
            cur=$REPLY
        ;;
        ~*)
            _comp_compgen -v COMPREPLY tilde && eval "COMPREPLY[0]=$(printf ~%q "${COMPREPLY[0]#\~}")" && return 1
        ;;
    esac;
    return 0
}
_comp_expand_glob () 
{ 
    if (($# != 2)); then
        printf 'bash-completion: %s: unexpected number of arguments\n' "$FUNCNAME" 1>&2;
        printf 'usage: %s ARRAY_NAME PATTERN\n' "$FUNCNAME" 1>&2;
        return 2;
    else
        if [[ $1 == @(GLOBIGNORE|GLOBSORT|_*|*[^_a-zA-Z0-9]*|[0-9]*|'') ]]; then
            printf 'bash-completion: %s: invalid array name "%s"\n' "$FUNCNAME" "$1" 1>&2;
            return 2;
        fi;
    fi;
    local _original_opts=$SHELLOPTS:$BASHOPTS;
    set +o noglob;
    shopt -s nullglob;
    shopt -u failglob dotglob;
    local GLOBIGNORE="" GLOBSORT=name;
    local LC_COLLATE=C LC_CTYPE=${LC_ALL:-${LC_CTYPE:-${LANG-}}} LC_ALL=;
    eval -- "$1=()";
    eval -- "$1=($2)";
    _comp_unlocal GLOBIGNORE;
    if [[ :$_original_opts: == *:dotglob:* ]]; then
        shopt -s dotglob;
    else
        shopt -u dotglob;
    fi;
    [[ :$_original_opts: == *:nullglob:* ]] || shopt -u nullglob;
    [[ :$_original_opts: == *:failglob:* ]] && shopt -s failglob;
    [[ :$_original_opts: == *:noglob:* ]] && set -o noglob;
    eval "((\${#$1[@]}))"
}
_comp_expand_tilde () 
{ 
    REPLY=$1;
    if [[ $1 == \~* ]]; then
        printf -v REPLY '~%q' "${1#\~}";
        eval "REPLY=$REPLY";
    fi
}
_comp_get_first_arg () 
{ 
    _comp_locate_first_arg "$@" && REPLY=${words[REPLY]}
}
_comp_get_ncpus () 
{ 
    local var=NPROCESSORS_ONLN;
    [[ $OSTYPE == *@(linux|msys|cygwin)* ]] && var=_$var;
    if REPLY=$(getconf $var 2> /dev/null) && ((REPLY >= 1)); then
        return 0;
    else
        REPLY=1;
        return 1;
    fi
}
_comp_get_words () 
{ 
    local exclude="" flag i OPTIND=1;
    local cur cword words=();
    local upargs=() upvars=() vcur="" vcword="" vprev="" vwords="";
    while getopts "c:i:n:p:w:" flag "$@"; do
        case $flag in 
            [cipw])
                if [[ $OPTARG != [a-zA-Z_]*([a-zA-Z_0-9])?(\[*\]) ]]; then
                    echo "bash_completion: $FUNCNAME: -$flag: invalid variable name \`$OPTARG'" 1>&2;
                    return 1;
                fi
            ;;&
            c)
                vcur=$OPTARG
            ;;
            i)
                vcword=$OPTARG
            ;;
            n)
                exclude=$OPTARG
            ;;
            p)
                vprev=$OPTARG
            ;;
            w)
                vwords=$OPTARG
            ;;
            *)
                echo "bash_completion: $FUNCNAME: usage error" 1>&2;
                return 1
            ;;
        esac;
    done;
    while [[ $# -ge $OPTIND ]]; do
        case ${!OPTIND} in 
            cur)
                vcur=cur
            ;;
            prev)
                vprev=prev
            ;;
            cword)
                vcword=cword
            ;;
            words)
                vwords=words
            ;;
            *)
                echo "bash_completion: $FUNCNAME: \`${!OPTIND}':" "unknown argument" 1>&2;
                return 1
            ;;
        esac;
        ((OPTIND += 1));
    done;
    _comp__get_cword_at_cursor "${exclude-}" words cword cur;
    [[ -n $vcur ]] && { 
        upvars+=("$vcur");
        upargs+=(-v "$vcur" "$cur")
    };
    [[ -n $vcword ]] && { 
        upvars+=("$vcword");
        upargs+=(-v "$vcword" "$cword")
    };
    [[ -n $vprev ]] && { 
        local value="";
        ((cword >= 1)) && value=${words[cword - 1]};
        upvars+=("$vprev");
        upargs+=(-v "$vprev" "$value")
    };
    [[ -n $vwords ]] && { 
        local IFS=' 	
';
        upvars+=("$vwords");
        upargs+=(-a"${#words[@]}" "$vwords" ${words+"${words[@]}"})
    };
    ((${#upvars[@]})) && local "${upvars[@]}" && _comp_upvars "${upargs[@]}"
}
_comp_have_command () 
{ 
    PATH=$PATH:/usr/sbin:/sbin:/usr/local/sbin type "$1" &> /dev/null
}
_comp_initialize () 
{ 
    local exclude="" opt_split="" outx="" errx="" inx="";
    local flag OPTIND=1 OPTARG="" OPTERR=0;
    while getopts "n:e:o:i:s" flag "$@"; do
        case $flag in 
            n)
                exclude+=$OPTARG
            ;;
            e)
                errx=$OPTARG
            ;;
            o)
                outx=$OPTARG
            ;;
            i)
                inx=$OPTARG
            ;;
            s)
                opt_split="set";
                was_split="";
                exclude+="="
            ;;
            *)
                echo "bash_completion: $FUNCNAME: usage error" 1>&2;
                return 1
            ;;
        esac;
    done;
    shift "$((OPTIND - 1))";
    (($#)) && comp_args=("$@");
    COMPREPLY=();
    local redir='@(?(+([0-9])|{[a-zA-Z_]*([a-zA-Z_0-9])})@(>?([>|&])|<?([>&])|<<?([-<]))|&>?(>))';
    _comp_get_words -n "$exclude<>&" cur prev words cword;
    _comp_compgen_variables && return 1;
    if [[ $cur == $redir* || ${prev-} == $redir ]]; then
        local xspec;
        case $cur in 
            2'>'*)
                xspec=${errx-}
            ;;
            *'>'*)
                xspec=${outx-}
            ;;
            *'<'*)
                xspec=${inx-}
            ;;
            *)
                case $prev in 
                    2'>'*)
                        xspec=${errx-}
                    ;;
                    *'>'*)
                        xspec=${outx-}
                    ;;
                    *'<'*)
                        xspec=${inx-}
                    ;;
                esac
            ;;
        esac;
        cur=${cur##$redir};
        _comp_compgen_filedir "$xspec";
        return 1;
    fi;
    local i skip;
    for ((i = 1; i < ${#words[@]}; 1))
    do
        if [[ ${words[i]} == $redir* ]]; then
            [[ ${words[i]} == $redir ]] && skip=2 || skip=1;
            words=("${words[@]:0:i}" "${words[@]:i+skip}");
            ((i <= cword)) && ((cword -= skip));
        else
            ((i++));
        fi;
    done;
    ((cword <= 0)) && return 1;
    prev=${words[cword - 1]};
    [[ -n $opt_split ]] && _comp__split_longopt && was_split="set";
    return 0
}
_comp_load () 
{ 
    local flag_fallback_default="" IFS=' 	
';
    local OPTIND=1 OPTARG="" OPTERR=0 opt;
    while getopts ':D' opt "$@"; do
        case $opt in 
            D)
                flag_fallback_default=set
            ;;
            *)
                echo "bash_completion: $FUNCNAME: usage error" 1>&2;
                return 2
            ;;
        esac;
    done;
    shift "$((OPTIND - 1))";
    local cmd=$1 cmdname=${1##*/} dir compfile;
    local -a paths;
    [[ -n $cmdname ]] || return 1;
    local backslash=;
    if [[ $cmd == \\* ]]; then
        cmd=${cmd:1};
        $(complete -p -- "$cmd" 2> /dev/null || echo false) "\\$cmd" && return 0;
        backslash=\\;
    fi;
    local REPLY pathcmd origcmd=$cmd;
    if pathcmd=$(type -P -- "$cmd"); then
        _comp_abspath "$pathcmd";
        cmd=$REPLY;
    fi;
    local -a dirs=();
    if [[ -n ${BASH_COMPLETION_USER_DIR-} ]]; then
        _comp_split -F : paths "$BASH_COMPLETION_USER_DIR" && dirs+=("${paths[@]/%//completions}");
    else
        dirs=("${XDG_DATA_HOME:-$HOME/.local/share}/bash-completion/completions");
    fi;
    dirs+=("$_comp__base_directory/completions");
    paths=();
    [[ $cmd == /* ]] && paths+=("${cmd%/*}");
    _comp_realcommand "$cmd" && paths+=("${REPLY%/*}");
    _comp_split -aF : paths "$PATH";
    for dir in "${paths[@]%/}";
    do
        [[ $dir == ?*/@(bin|sbin) ]] && dirs+=("${dir%/*}/share/bash-completion/completions");
    done;
    _comp_split -F : paths "${XDG_DATA_DIRS:-/usr/local/share:/usr/share}" && dirs+=("${paths[@]/%//bash-completion/completions}");
    local IFS=' 	
';
    shift;
    local i prefix compspec;
    for prefix in "" _;
    do
        for i in ${!dirs[*]};
        do
            dir=${dirs[i]};
            if [[ ! -d $dir ]]; then
                unset -v 'dirs[i]';
                continue;
            fi;
            for compfile in "$prefix$cmdname" "$prefix$cmdname.bash";
            do
                compfile="$dir/$compfile";
                if [[ -d $compfile ]]; then
                    [[ $compfile == */.?(.) ]] || echo "bash_completion: $compfile: is a directory" 1>&2;
                else
                    if [[ -e $compfile ]] && . "$compfile" "$cmd" "$@"; then
                        if compspec=$(complete -p -- "$cmd" 2> /dev/null); then
                            [[ -n $backslash ]] && eval "$compspec \"\$backslash\$cmd\"";
                            [[ $origcmd != */* ]] && ! complete -p -- "$origcmd" &> /dev/null && eval "$compspec \"\$origcmd\"";
                            return 0;
                        fi;
                        if [[ $cmdname != "$cmd" ]] && compspec=$(complete -p -- "$cmdname" 2> /dev/null); then
                            [[ $cmd == /* ]] && eval "$compspec \"\$cmd\"";
                            return 0;
                        fi;
                    fi;
                fi;
            done;
        done;
    done;
    [[ -v _comp_xspecs[$cmdname] || -v _xspecs[$cmdname] ]] && complete -F _comp_complete_filedir_xspec "$cmdname" "$backslash$cmdname" && return 0;
    if [[ -n $flag_fallback_default ]]; then
        complete -F _comp_complete_minimal -- "$origcmd" && return 0;
    fi;
    return 1
}
_comp_locate_first_arg () 
{ 
    local has_optarg="";
    local OPTIND=1 OPTARG="" OPTERR=0 _opt;
    while getopts ':a:' _opt "$@"; do
        case $_opt in 
            a)
                has_optarg=$OPTARG
            ;;
            *)
                echo "bash_completion: $FUNCNAME: usage error" 1>&2;
                return 2
            ;;
        esac;
    done;
    shift "$((OPTIND - 1))";
    local i;
    REPLY=;
    for ((i = 1; i < cword; i++))
    do
        if [[ -n $has_optarg && ${words[i]} == $has_optarg ]]; then
            ((i++));
        else
            if [[ ${words[i]} != -?* ]]; then
                REPLY=$i;
                return 0;
            else
                if [[ ${words[i]} == -- ]]; then
                    ((i + 1 < cword)) && REPLY=$((i + 1)) && return 0;
                    break;
                fi;
            fi;
        fi;
    done;
    return 1
}
_comp_looks_like_path () 
{ 
    [[ ${1-} == @(*/|[.~])* ]]
}
_comp_ltrim_colon_completions () 
{ 
    ((${#COMPREPLY[@]})) || return 0;
    _comp_compgen -c "$1" ltrim_colon "${COMPREPLY[@]}"
}
_comp_quote () 
{ 
    REPLY=\'${1//\'/\'\\\'\'}\'
}
_comp_quote_compgen () 
{ 
    if [[ $1 == \'* ]]; then
        REPLY=${1:1};
    else
        printf -v REPLY %q "$1";
        if [[ $REPLY == \$\'*\' ]]; then
            local value=${REPLY:2:-1};
            value=${value//'%'/%%};
            printf -v REPLY "$value";
        fi;
    fi
}
_comp_readline_variable_on () 
{ 
    [[ $(bind -v) == *$1+([[:space:]])on* ]]
}
_comp_realcommand () 
{ 
    REPLY="";
    local file;
    file=$(type -P -- "$1") || return $?;
    if type -p realpath > /dev/null; then
        REPLY=$(realpath "$file");
    else
        if type -p greadlink > /dev/null; then
            REPLY=$(greadlink -f "$file");
        else
            if type -p readlink > /dev/null; then
                REPLY=$(readlink -f "$file");
            else
                _comp_abspath "$file";
            fi;
        fi;
    fi
}
_comp_root_command () 
{ 
    local PATH=$PATH:/sbin:/usr/sbin:/usr/local/sbin;
    local _comp_root_command=$1;
    _comp_command
}
_comp_split () 
{ 
    local _append="" IFS=' 	
';
    local OPTIND=1 OPTARG="" OPTERR=0 _opt;
    while getopts ':alF:' _opt "$@"; do
        case $_opt in 
            a)
                _append=set
            ;;
            l)
                IFS='
'
            ;;
            F)
                IFS=$OPTARG
            ;;
            *)
                echo "bash_completion: $FUNCNAME: usage error" 1>&2;
                return 2
            ;;
        esac;
    done;
    shift "$((OPTIND - 1))";
    if (($# != 2)); then
        printf '%s\n' "bash_completion: $FUNCNAME: unexpected number of arguments" 1>&2;
        printf '%s\n' "usage: $FUNCNAME [-al] [-F SEP] ARRAY_NAME TEXT" 1>&2;
        return 2;
    else
        if [[ $1 == @(*[^_a-zA-Z0-9]*|[0-9]*|''|_*|IFS|OPTIND|OPTARG|OPTERR) ]]; then
            printf '%s\n' "bash_completion: $FUNCNAME: invalid array name '$1'" 1>&2;
            return 2;
        fi;
    fi;
    local _original_opts=$SHELLOPTS;
    set -o noglob;
    local _old_size _new_size;
    if [[ -n $_append ]]; then
        eval "$1+=()";
        eval "_old_size=\${#$1[@]}";
        eval "$1+=(\$2)";
    else
        _old_size=0;
        eval "$1=(\$2)";
    fi;
    eval "_new_size=\${#$1[@]}";
    [[ :$_original_opts: == *:noglob:* ]] || set +o noglob;
    ((_new_size > _old_size))
}
_comp_sysvdirs () 
{ 
    sysvdirs=();
    [[ -d /etc/rc.d/init.d ]] && sysvdirs+=(/etc/rc.d/init.d);
    [[ -d /etc/init.d ]] && sysvdirs+=(/etc/init.d);
    [[ -f /etc/slackware-version ]] && sysvdirs=(/etc/rc.d);
    ((${#sysvdirs[@]}))
}
_comp_try_faketty () 
{ 
    if type unbuffer &> /dev/null; then
        unbuffer -p "$@";
    else
        if script --version 2>&1 | command grep -qF util-linux; then
            script -qaefc "$*" /dev/null;
        else
            "$@";
        fi;
    fi
}
_comp_unlocal () 
{ 
    if ((BASH_VERSINFO[0] >= 5)) && shopt -q localvar_unset; then
        shopt -u localvar_unset;
        unset -v "$@";
        shopt -s localvar_unset;
    else
        unset -v "$@";
    fi
}
_comp_upvars () 
{ 
    if ! (($#)); then
        echo "bash_completion: $FUNCNAME: usage: $FUNCNAME" "[-v varname value] | [-aN varname [value ...]] ..." 1>&2;
        return 2;
    fi;
    while (($#)); do
        case $1 in 
            -a*)
                [[ -n ${1#-a} ]] || { 
                    echo "bash_completion: $FUNCNAME:" "\`$1': missing number specifier" 1>&2;
                    return 1
                };
                printf %d "${1#-a}" &> /dev/null || { 
                    echo bash_completion: "$FUNCNAME: \`$1': invalid number specifier" 1>&2;
                    return 1
                };
                [[ -n $2 ]] && unset -v "$2" && eval "$2"=\(\"\$"{@:3:${1#-a}}"\"\) && shift $((${1#-a} + 2)) || { 
                    echo bash_completion: "$FUNCNAME: \`$1${2+ }$2': missing argument(s)" 1>&2;
                    return 1
                }
            ;;
            -v)
                [[ -n $2 ]] && unset -v "$2" && eval "$2"=\"\$3\" && shift 3 || { 
                    echo "bash_completion: $FUNCNAME: $1:" "missing argument(s)" 1>&2;
                    return 1
                }
            ;;
            *)
                echo "bash_completion: $FUNCNAME: $1: invalid option" 1>&2;
                return 1
            ;;
        esac;
    done
}
_comp_userland () 
{ 
    local userland=$(uname -s);
    [[ $userland == @(Linux|GNU/*) ]] && userland=GNU;
    [[ $userland == "$1" ]]
}
_comp_variable_assignments () 
{ 
    local cur=${1-} i;
    if [[ $cur =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        prev=${BASH_REMATCH[1]};
        cur=${BASH_REMATCH[2]};
    else
        return 1;
    fi;
    case $prev in 
        TZ)
            cur=/usr/share/zoneinfo/$cur;
            _comp_compgen_filedir;
            if ((${#COMPREPLY[@]})); then
                for i in "${!COMPREPLY[@]}";
                do
                    if [[ ${COMPREPLY[i]} == *.tab ]]; then
                        unset -v 'COMPREPLY[i]';
                        continue;
                    else
                        if [[ -d ${COMPREPLY[i]} ]]; then
                            COMPREPLY[i]+=/;
                            compopt -o nospace;
                        fi;
                    fi;
                    COMPREPLY[i]=${COMPREPLY[i]#/usr/share/zoneinfo/};
                done;
            fi
        ;;
        TERM)
            _comp_compgen_terms
        ;;
        LANG | LC_*)
            _comp_compgen_split -- "$(locale -a 2> /dev/null)"
        ;;
        LANGUAGE)
            _comp_delimited : -W '$(locale -a 2>/dev/null)'
        ;;
        *)
            _comp_compgen_variables && return 0;
            _comp_compgen -a filedir
        ;;
    esac;
    return 0
}
_comp_xfunc () 
{ 
    local xfunc_name=$2;
    [[ $xfunc_name == _* ]] || xfunc_name=_comp_xfunc_${1//[^a-zA-Z0-9_]/_}_$xfunc_name;
    declare -F -- "$xfunc_name" &> /dev/null || _comp_load -- "$1";
    "$xfunc_name" "${@:3}"
}
_complete_as_root () 
{ 
    _comp_as_root "$@"
}
_completion_loader () 
{ 
    _comp_complete_load "$@"
}
_configured_interfaces () 
{ 
    _comp_compgen_configured_interfaces "$@"
}
_count_args () 
{ 
    local i cword words;
    _comp__reassemble_words "${1-}" words cword;
    args=1;
    for ((i = 1; i < cword; i++))
    do
        if [[ ${words[i]} != -* && ${words[i - 1]} != ${2-} || ${words[i]} == ${3-} ]]; then
            ((args++));
        fi;
    done
}
_dvd_devices () 
{ 
    _comp_compgen -a dvd_devices
}
_expand () 
{ 
    _comp_expand "$@"
}
_filedir () 
{ 
    _comp_compgen -a filedir "$@"
}
_filedir_xspec () 
{ 
    _comp_complete_filedir_xspec "$@"
}
_fstypes () 
{ 
    _comp_compgen -a fstypes
}
_ftcs_command_executed () 
{ 
    printf "\e]133;C\a"
}
_ftcs_command_finished () 
{ 
    printf "\e]133;D;\$?\a"
}
_ftcs_command_start () 
{ 
    printf "\e]133;B\a"
}
_ftcs_prompt () 
{ 
    printf "\e]133;A\a"
}
_get_comp_words_by_ref () 
{ 
    _comp_get_words "$@"
}
_get_cword () 
{ 
    local LC_CTYPE=C;
    local cword words;
    _comp__reassemble_words "${1-}" words cword;
    if [[ -n ${2-} && -n ${2//[^0-9]/} ]]; then
        printf "%s" "${words[cword - $2]}";
    else
        if ((${#words[cword]} == 0 && COMP_POINT == ${#COMP_LINE})); then
            :;
        else
            local i;
            local cur=$COMP_LINE;
            local index=$COMP_POINT;
            for ((i = 0; i <= cword; ++i))
            do
                while [[ ${#cur} -ge ${#words[i]} && ${cur:0:${#words[i]}} != "${words[i]}" ]]; do
                    cur=${cur:1};
                    ((index > 0)) && ((index--));
                done;
                if ((i < cword)); then
                    local old_size=${#cur};
                    cur=${cur#"${words[i]}"};
                    local new_size=${#cur};
                    ((index -= old_size - new_size));
                fi;
            done;
            if [[ ${words[cword]:0:${#cur}} != "$cur" ]]; then
                printf "%s" "${words[cword]}";
            else
                printf "%s" "${cur:0:index}";
            fi;
        fi;
    fi
}
_get_first_arg () 
{ 
    local i;
    arg=;
    for ((i = 1; i < COMP_CWORD; i++))
    do
        if [[ ${COMP_WORDS[i]} != -* ]]; then
            arg=${COMP_WORDS[i]};
            break;
        fi;
    done
}
_get_pword () 
{ 
    if ((COMP_CWORD >= 1)); then
        _get_cword "${@-}" 1;
    fi
}
_gids () 
{ 
    _comp_compgen_gids "$@"
}
_have () 
{ 
    _comp_have_command "$@"
}
_init_completion () 
{ 
    local was_split;
    _comp_initialize "$@";
    local rc=$?;
    local flag OPTIND=1 OPTARG="" OPTERR=0;
    while getopts "n:e:o:i:s" flag "$@"; do
        case $flag in 
            [neoi])

            ;;
            s)
                if [[ -n $was_split ]]; then
                    split=true;
                else
                    split=false;
                fi;
                break
            ;;
        esac;
    done;
    return "$rc"
}
_installed_modules () 
{ 
    _comp_compgen_inserted_kernel_modules "$@"
}
_ip_addresses () 
{ 
    _comp_compgen_ip_addresses "$@"
}
_kernel_versions () 
{ 
    _comp_compgen_kernel_versions "$@"
}
_known_hosts () 
{ 
    _comp_complete_known_hosts "$@"
}
_known_hosts_real () 
{ 
    _comp_compgen_known_hosts "$@"
}
_longopt () 
{ 
    _comp_complete_longopt "$@"
}
_mac_addresses () 
{ 
    _comp_compgen_mac_addresses "$@"
}
_minimal () 
{ 
    _comp_complete_minimal "$@"
}
_modules () 
{ 
    _comp_compgen_kernel_modules "$@"
}
_ncpus () 
{ 
    local REPLY;
    _comp_get_ncpus;
    printf %s "$REPLY"
}
_parse_help () 
{ 
    local -a args;
    if [[ $1 == - ]]; then
        args=(-);
    else
        local REPLY opt IFS=' 	
';
        _comp_dequote "$1";
        _comp_split opt "${2:---help}";
        args=(-c "$REPLY" ${opt[@]+"${opt[@]}"});
    fi;
    local -a REPLY=();
    _comp_compgen -Rv REPLY help "${args[@]}" || return 1;
    ((${#REPLY[@]})) && printf '%s\n' "${REPLY[@]}";
    return 0
}
_parse_usage () 
{ 
    local -a args;
    if [[ $1 == - ]]; then
        args=(-);
    else
        local REPLY opt IFS=' 	
';
        _comp_dequote "$1";
        _comp_split opt "${2:---usage}";
        args=(-c "$REPLY" ${opt[@]+"${opt[@]}"});
    fi;
    local -a REPLY=();
    _comp_compgen -Rv REPLY usage "${args[@]}" || return 1;
    ((${#REPLY[@]})) && printf '%s\n' "${REPLY[@]}";
    return 0
}
_pci_ids () 
{ 
    _comp_compgen -a pci_ids
}
_pgids () 
{ 
    _comp_compgen_pgids "$@"
}
_pids () 
{ 
    _comp_compgen_pids "$@"
}
_pnames () 
{ 
    _comp_compgen_pnames "$@"
}
_quote_readline_by_ref () 
{ 
    [[ $2 == REPLY ]] || local REPLY;
    _comp_quote_compgen "$1";
    [[ $2 == REPLY ]] || printf -v "$2" %s "$REPLY"
}
_realcommand () 
{ 
    local REPLY;
    _comp_realcommand "$1";
    local rc=$?;
    printf "%s\n" "$REPLY";
    return $rc
}
_replit_command_tracking () 
{ 
    printf "\e]82;A;%s\a" "$1"
}
_replit_normalize_profile_path () 
{ 
    _profile_path_new="${HOME}/.nix-profile/bin";
    _profile_path_remaining=${PATH};
    while [ -n "${_profile_path_remaining}" ]; do
        _profile_path_component=${_profile_path_remaining%%:*};
        if [ "${_profile_path_remaining}" = "${_profile_path_component}" ]; then
            _profile_path_remaining=;
        else
            _profile_path_remaining=${_profile_path_remaining#*:};
        fi;
        case "${_profile_path_component}" in 
            "" | "/home/runner/.nix-profile/bin" | "${HOME}/.nix-profile/bin")

            ;;
            *)
                _profile_path_new="${_profile_path_new}:${_profile_path_component}"
            ;;
        esac;
    done;
    printf '%s' "${_profile_path_new}"
}
_replit_pwd_tracking () 
{ 
    printf "\e]82;B;%s\a" "$(pwd)"
}
_replit_update_prompt () 
{ 
    if [[ "${_custom_prompt}" == "" || "${_custom_prompt}" != "${PS1}" ]]; then
        _original_prompt="${PS1}";
        _custom_prompt="\[$(_ftcs_command_finished)\]\[$(_ftcs_prompt)\]${_original_prompt}\[$(_ftcs_command_start)\]";
        PS1="${_custom_prompt}";
    fi
}
_rl_enabled () 
{ 
    _comp_readline_variable_on "$@"
}
_root_command () 
{ 
    _comp_root_command "$@"
}
_service () 
{ 
    _comp_complete_service "$@"
}
_services () 
{ 
    _comp_compgen_services "$@"
}
_shells () 
{ 
    _comp_compgen -a shells
}
_signals () 
{ 
    _comp_compgen_signals "$@"
}
_sysvdirs () 
{ 
    _comp_sysvdirs "$@"
}
_terms () 
{ 
    _comp_compgen -a terms
}
_tilde () 
{ 
    ! _comp_compgen -c "$1" tilde
}
_uids () 
{ 
    _comp_compgen_uids "$@"
}
_upvar () 
{ 
    echo "bash_completion: $FUNCNAME: deprecated function," "use _comp_upvars instead" 1>&2;
    if unset -v "$1"; then
        if (($# == 2)); then
            eval "$1"=\"\$2\";
        else
            eval "$1"=\(\"\$"{@:2}"\"\);
        fi;
    fi
}
_upvars () 
{ 
    _comp_upvars "$@"
}
_usb_ids () 
{ 
    _comp_compgen -a usb_ids
}
_user_at_host () 
{ 
    _comp_complete_user_at_host "$@"
}
_usergroup () 
{ 
    _comp_compgen_usergroups "$@"
}
_userland () 
{ 
    _comp_userland "$@"
}
_variables () 
{ 
    _comp_compgen_variables "$@"
}
_xfunc () 
{ 
    _comp_xfunc "$@"
}
_xinetd_services () 
{ 
    _comp_compgen_xinetd_services "$@"
}
command_not_found_handle () 
{ 
    if ! [[ -t 0 ]] || [[ $- != *i* ]]; then
        echo "bash: $1: command not found" 1>&2;
        return 127;
    fi;
    if [[ -n "${MC_SID-}" ]] || ! [[ -t 1 ]]; then
        echo "bash: $1: command not found" 1>&2;
        return 127;
    fi;
    wait_till_env_up_to_date;
    maybe_notify_error;
    if [[ -f "${SHELL_ENV}" ]] && [[ "${ACTIVE_TS}" -lt "$(/nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/date -r "${SHELL_ENV}" "${TS_FMT}" 2> /dev/null || echo 0)" ]]; then
        update_environment;
        "$@";
        return $?;
    fi;
    cmd="$1";
    nixmodule_installed=;
    if [[ "$cmd" == @(python|poetry|pip)* ]]; then
        if /nix/store/l2wvwyg680h0v2la18hz3yiznxy2naqw-gnugrep-3.11/bin/grep --silent 'python-3\.\(8\|10\|11\|12\):' "${REPL_HOME}/.replit" 2> /dev/null; then
            echo "bash: $1: command not found" 1>&2;
            return 127;
        fi;
        maybe_install_nix_module "Python" "python-3.11";
        nixmodule_installed="$?";
    else
        if [[ "$cmd" == @(node|npm|npx|pnpm|pnpx|yarn)* ]]; then
            if /nix/store/l2wvwyg680h0v2la18hz3yiznxy2naqw-gnugrep-3.11/bin/grep --silent '(nodejs|bun)-[0-9]*(\.[0-9])?:' "${REPL_HOME}/.replit" 2> /dev/null; then
                echo "bash: $1: command not found" 1>&2;
                return 127;
            fi;
            maybe_install_nix_module "Node" "nodejs-20";
            nixmodule_installed="$?";
        else
            if [[ "$cmd" == @(bun|bunx)* ]]; then
                if /nix/store/l2wvwyg680h0v2la18hz3yiznxy2naqw-gnugrep-3.11/bin/grep --silent '(nodejs|bun)-[0-9]*(\.[0-9])?:' "${REPL_HOME}/.replit" 2> /dev/null; then
                    echo "bash: $1: command not found" 1>&2;
                    return 127;
                fi;
                maybe_install_nix_module "Bun" "bun-1.1";
                nixmodule_installed="$?";
            fi;
        fi;
    fi;
    if [[ -n "${nixmodule_installed}" ]] && [[ "${nixmodule_installed}" -eq 0 ]]; then
        ( wait_till_env_up_to_date && source "$SHELL_ENV";
        rc="$?";
        if [[ "${rc}" -eq 0 ]]; then
            if /nix/store/s0pv1byj75arx8wfmw659y11dy4a41hy-which-2.23/bin/which "$1" &> /dev/null; then
                "$@";
            else
                echo "bash: ${cmd}: command not found" 1>&2;
                exit 127;
            fi;
        else
            exit "$rc";
        fi );
        return "$?";
    fi;
    toplevel=nixpkgs;
    mapfile -t choices < <(/nix/store/8mqmbb05zg3b5x7yb3bwxfcq5klgzb6i-replit-nix-locate/bin/nix-locate --minimal --at-root --whole-name "/bin/${cmd}" | /nix/store/md2z14bhvqk8nvylad6fiifcd19vhlqz-jq-1.7.1-bin/bin/jq -Rr '
            . as $fullAttr
            | $fullAttr[:$fullAttr | rindex(".")]
            | select([.] | inside(["busybox", "toybox"]) | not)
          ' | /nix/store/392hs9nhm6wfw4imjllbvb1wil1n39qx-findutils-4.10.0/bin/xargs -n 1 /nix/store/8vw1zfdbclvr0xyqdw9qy2k2q3vws1vh-replit-rippkgs/bin/rippkgs --json --exact 2> /dev/null | /nix/store/md2z14bhvqk8nvylad6fiifcd19vhlqz-jq-1.7.1-bin/bin/jq -r '
            map([.attribute, .version, .description])[]
            | @tsv
          ' | /nix/store/smvpwhzmx1qc21yxc798drwfpsb7ng34-util-linux-2.41.1-bin/bin/column -ts '	');
    case "${#choices[@]}" in 
        0)
            echo "bash: ${cmd}: command not found" 1>&2;
            return 127
        ;;
        1)
            /nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/cat 1>&2 <<EOF
${cmd}: command not installed, but was located via Nix.
package: ${choices[0]}
EOF

            case "$(read -r -p "Would you like to run ${cmd} from Nix and add it to your project? [Yn]: " < /dev/tty && echo "${REPLY}")" in 
                "y" | "Y" | "")
                    selection="${choices[0]}"
                ;;
                *)
                    return 127
                ;;
            esac
        ;;
        *)
            /nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/cat 1>&2 <<EOF
${cmd}: command not installed. Multiple versions of this command were found in Nix.
Select one to run (or press Ctrl-C to cancel):
EOF

            selection="$(printf '%s\n' "${choices[@]}" | /nix/store/v36cz7cy3p001pyspjfsgawqx7ln73ms-fzy-1.0/bin/fzy)"
            if [[ "$?" -ne 0 ]]; then
                return 127;
            fi
        ;;
    esac;
    echo "$selection";
    attr="$(echo "$selection" | /nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/cut -d ' ' -f 1)";
    output="$(/nix/store/8mqmbb05zg3b5x7yb3bwxfcq5klgzb6i-replit-nix-locate/bin/nix-locate --minimal --at-root --whole-name "/bin/${cmd}" | grep "^${attr}\." | awk -F '.' '{print $NF}')";
    storepath="/nix/store/$(/nix/store/8vw1zfdbclvr0xyqdw9qy2k2q3vws1vh-replit-rippkgs/bin/rippkgs --json --exact "${attr}" | /nix/store/md2z14bhvqk8nvylad6fiifcd19vhlqz-jq-1.7.1-bin/bin/jq -r ".[0].store_paths.${output}")";
    binpath="${storepath}/bin/${cmd}";
    channel="${REPLIT_NIX_CHANNEL:-unknown}";
    if install_nix_package "${attr}" "${storepath}" "${binpath}" "${channel}" "${toplevel}"; then
        build_status=0;
    else
        build_status="$?";
    fi;
    if [[ "${build_status}" -eq 86 ]]; then
        return "${build_status}";
    fi;
    if [[ "${build_status}" -eq 0 ]]; then
        if [[ ! -f "${REPLIT_NIX}" ]]; then
            echo "Adding ${attr} to .replit" 1>&2;
            pkgs="$(echo '[{"op":"get","path":"nix/packages"}]' | /nix/store/hw9qxplkf7q92cz8fmpi98i0qp5f7wpi-toml-editor-0.0.0-7452ace/bin/toml-editor --path "${DOT_REPLIT}" 2> /dev/null | /nix/store/md2z14bhvqk8nvylad6fiifcd19vhlqz-jq-1.7.1-bin/bin/jq -c '.results[]')";
            if [[ "$pkgs" == "null" ]]; then
                pkgs="[]";
            fi;
            if ! echo "$pkgs" | /nix/store/md2z14bhvqk8nvylad6fiifcd19vhlqz-jq-1.7.1-bin/bin/jq -e --arg attr "$attr" 'index($attr) != null' &> /dev/null; then
                pkgs="$(echo "$pkgs" | /nix/store/md2z14bhvqk8nvylad6fiifcd19vhlqz-jq-1.7.1-bin/bin/jq -c --arg attr "$attr" '. + [$attr]')";
            fi;
            echo '[{"op":"add","path":"nix/packages","value":"'"$(echo "$pkgs" | /nix/store/4rpiqv9yr2pw5094v4wc33ijkqjpm9sa-gnused-4.9/bin/sed 's/"/\\"/g')"'"}]' | /nix/store/hw9qxplkf7q92cz8fmpi98i0qp5f7wpi-toml-editor-0.0.0-7452ace/bin/toml-editor --path "${DOT_REPLIT}" &> /dev/null;
        else
            echo "Adding ${attr} to replit.nix" 1>&2;
            /nix/store/xw6d3ms54zgg42v6j9s00lh1kxzgksyl-nix-editor-0.0.0-9472fbd/bin/nix-editor --add "pkgs.${attr}" --human --path "${REPLIT_NIX}";
        fi;
        if [[ -f "${binpath}" ]]; then
            shift 1;
            "${binpath}" "${@}";
        else
            nix-shell -p "$attr" --run "$(printf '%q ' "$@")";
        fi;
        return $?;
    else
        /nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/cat 1>&2 <<EOF
Failed to install ${toplevel}.${attr}.
$cmd: command not found
EOF

        return 127;
    fi
}
dequote () 
{ 
    local REPLY;
    _comp_dequote "$1";
    local rc=$?;
    printf %s "$REPLY";
    return $rc
}
ensure_gated_profile_path () 
{ 
    if [ "${REPLIT_PID1_FLAG_NO_SNIX:-}" = "1" ] && [ "${REPLIT_MACHINE:-}" != "1" ] && [ -n "${HOME:-}" ]; then
        if [ "${HOME}" != "/home/runner" ]; then
            PATH=$(_replit_normalize_profile_path);
            export PATH;
            return;
        fi;
        case ":${PATH}:" in 
            *":${HOME}/.nix-profile/bin:"*)

            ;;
            *)
                export PATH="${HOME}/.nix-profile/bin:${PATH}"
            ;;
        esac;
    fi
}
ensure_or_build_nix_package () 
{ 
    if realise_nix_package "$2"; then
        return 0;
    else
        realise_status="$?";
    fi;
    if [[ "${realise_status}" -eq 86 ]]; then
        return "${realise_status}";
    fi;
    echo "Package-store install failed; building $1 locally" 1>&2;
    if nix-build --no-out-link -A "$1" "<$4>"; then
        build_status=0;
    else
        build_status="$?";
    fi;
    if [[ "${build_status}" -eq 0 ]]; then
        realise_nix_package "$2";
        realise_status="$?";
        if [[ "${realise_status}" -eq 86 ]]; then
            return "${realise_status}";
        else
            if [[ "${realise_status}" -ne 0 ]]; then
                echo "Warning: $1 may need to be rebuilt after a reboot" 1>&2;
            fi;
        fi;
    fi;
    return "${build_status}"
}
env_has_pending_build () 
{ 
    if [[ "${REPLIT_NIX}" -nt "${SHELL_ENV}" ]] || [[ "${DOT_REPLIT}" -nt "${SHELL_ENV}" ]] || [[ "${MODULES_STAMP}" -nt "${SHELL_ENV}" ]]; then
        if [[ -f "${SHELL_ENV_ERROR}" ]]; then
            if [[ "${REPLIT_NIX}" -nt "${SHELL_ENV_ERROR}" ]] || [[ "${DOT_REPLIT}" -nt "${SHELL_ENV_ERROR}" ]] || [[ "${MODULES_STAMP}" -nt "${SHELL_ENV_ERROR}" ]]; then
                return 0;
            else
                return 1;
            fi;
        else
            return 0;
        fi;
    else
        return 1;
    fi
}
install_nix_package () 
{ 
    if [[ "${REPLIT_PID1_FLAG_NO_SNIX:-}" == "1" ]]; then
        ensure_or_build_nix_package "$1" "$2" "$4" "$5";
        return $?;
    fi;
    [[ -f "$3" ]] || nix-build --no-out-link -A "$1" "<$5>"
}
maybe_install_nix_module () 
{ 
    TOOL_NAME="$1";
    MODULE_ID="$2";
    yes_or_no "Install Replit's ${TOOL_NAME} tools" || return 1;
    result="$(/nix/store/vqapsnihn8flnsc1z7392b7m7f64g85n-curl-8.14.1-bin/bin/curl --silent --header "Content-Type: application/json" --request POST --data "{\"ids\":[\"${MODULE_ID}\"]}" localhost:8283/nixmodule/add)";
    if [[ "${result}" != '{"status":"ok"}' ]]; then
        echo -e "\e[0;33m${__REPLIT_LOGO} Failed to add tools, check whether your .replit file is properly formatted.\e[0m" 1>&2;
        return 1;
    fi
}
maybe_notify_error () 
{ 
    if [[ -f "${SHELL_ENV_ERROR}" && "${ACTIVE_TS}" -lt "$(/nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/date -r "${SHELL_ENV_ERROR}" "${TS_FMT}" 2> /dev/null || echo 0)" ]]; then
        echo -e "\e[0;33m${__REPLIT_LOGO} Failed to compile new environment.\e[0m" 1>&2;
        echo -e "\e[0;33m${__REPLIT_LOGO} Run \`cat ${SHELL_ENV_ERROR}\` to display the error.\e[0m" 1>&2;
        ACTIVE_TS="$(/nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/date -r "${SHELL_ENV_ERROR}" "${TS_FMT}" 2> /dev/null || echo 0)";
    fi
}
pbcopy () 
{ 
    printf "\e]52;c;%s\a" "$(/nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/base64 -w0)"
}
precmd () 
{ 
    _replit_pwd_tracking
}
preexec () 
{ 
    escaped="$(echo "$1" | /nix/store/4rpiqv9yr2pw5094v4wc33ijkqjpm9sa-gnused-4.9/bin/sed 's/"/\\"/g')";
    _replit_command_tracking "${escaped}";
    _replit_pwd_tracking;
    _ftcs_command_executed
}
prompt_command () 
{ 
    history -a;
    if [[ -f "${SHELL_ENV}" ]] && [[ "${ACTIVE_TS}" -lt "$(/nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/date -r "${SHELL_ENV}" "${TS_FMT}" 2> /dev/null || echo 0)" ]]; then
        update_environment;
    fi
}
quote () 
{ 
    local quoted=${1//\'/\'\\\'\'};
    printf "'%s'" "$quoted"
}
quote_readline () 
{ 
    local REPLY;
    _comp_quote_compgen "$1";
    printf %s "$REPLY"
}
realise_nix_package () 
{ 
    realise_storepath="$1";
    realise_store_prefix="/nix/store/";
    if [[ "${realise_storepath}" != "${realise_store_prefix}"* ]]; then
        return 1;
    fi;
    realise_store_name="${realise_storepath#"${realise_store_prefix}"}";
    case "${realise_store_name}" in 
        */*)
            return 1
        ;;
    esac;
    realise_store_hash="${realise_store_name%%-*}";
    case "${realise_store_name}" in 
        "${realise_store_hash}"-*)

        ;;
        *)
            return 1
        ;;
    esac;
    realise_store_suffix="${realise_store_name#"${realise_store_hash}"-}";
    if [[ "${#realise_store_hash}" -ne 32 ]] || [[ -z "${realise_store_suffix}" ]]; then
        return 1;
    fi;
    case "${realise_store_hash}" in 
        *[!0-9a-df-np-sv-z]*)
            return 1
        ;;
    esac;
    realise_root_dir="/nix/var/nix/gcroots/replit-package-store";
    if [[ "${REPLIT_PID1_FLAG_NO_SNIX:-}" == "1" && "${REPLIT_MACHINE:-}" != "1" ]]; then
        realise_root_dir="/nix/var/nix-local/gcroots/replit-package-store";
    fi;
    realise_root_indirect=;
    if ! /nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/mkdir -p -- "${realise_root_dir}" 2> /dev/null || [[ ! -w "${realise_root_dir}" ]]; then
        if [[ -z "${HOME:-}" || "${HOME}" != /* ]]; then
            return 1;
        fi;
        realise_root_dir="${HOME}/.local/state/nix/gcroots/replit-package-store";
        if ! /nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/mkdir -p -- "${realise_root_dir}" || [[ ! -w "${realise_root_dir}" ]]; then
            return 1;
        fi;
        realise_root_indirect=1;
    fi;
    realise_root="${realise_root_dir}/command-not-found-${realise_store_hash}";
    nix-store --realise "${realise_storepath}" ${realise_root_indirect:+--indirect} --add-root "${realise_root}" --option require-sigs true --option fallback false --option builders "" --option max-jobs 0 > /dev/null;
    realise_status="$?";
    if [[ "${realise_status}" -ne 0 ]]; then
        return "${realise_status}";
    fi;
    if ! nix store verify --recursive --no-trust "${realise_storepath}"; then
        echo "Integrity verification failed for ${realise_storepath}; repair or reset the package store before retrying" 1>&2;
        return 86;
    fi
}
update_environment () 
{ 
    ACTIVE_TS="$(/nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/date -r "${SHELL_ENV}" "${TS_FMT}")";
    source "${SHELL_ENV}" || exit;
    ensure_gated_profile_path
}
wait_till_env_up_to_date () 
{ 
    if env_has_pending_build; then
        echo -ne "\e[33m${__REPLIT_LOGO} Waiting for environment to update.";
        /nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/sleep 1;
        while env_has_pending_build; do
            echo -n ".";
            /nix/store/rry6qingvsrqmc7ll7jgaqpybcbdgf5v-coreutils-9.7/bin/sleep 1;
        done;
        echo -ne "\e[0m\r";
    fi
}
yes_or_no () 
{ 
    while true; do
        printf "\e[33m$* [y/n] %s \e[0m" "${__REPLIT_LOGO}";
        read -rp "" yn;
        case $yn in 
            [Yy]*)
                return 0
            ;;
            [Nn]*)
                echo "Aborted";
                return 1
            ;;
        esac;
    done
}

# setopts 3
set -o braceexpand
set -o hashall
set -o interactive-comments

# aliases 7
alias egrep='egrep --color=auto'
alias fgrep='fgrep --color=auto'
alias grep='/nix/store/l2wvwyg680h0v2la18hz3yiznxy2naqw-gnugrep-3.11/bin/grep --color=auto'
alias l='ls -CF'
alias la='ls -A'
alias ll='ls -alF'
alias ls='ls --color=auto'

# exports (native declarations)
declare -x AGORA_APP_CERTIFICATE="ddd3fe0510f14b97ac38d6c0d9eb372b"
declare -x AGORA_APP_ID="bf46d458736741548edf172653a3a080"
declare -x AGORA_CUSTOMER_ID="6d13760ab5fb4f7b95481dcd9724de50"
declare -x AGORA_SECRET="0abdcf77d3d2450396c23519c5ea97b7"
declare -x BUNNY_STREAM_API_KEY="e4ffcedf-2b6c-4910-993d196a3d00-c8a7-4d3c"
declare -x BUNNY_STREAM_HOSTNAME="vz-bee290c4-db2.b-cdn.net"
declare -x BUNNY_STREAM_LIBRARY_ID="756811"
declare -x CLERK_PUBLISHABLE_KEY="pk_test_cHJpbWFyeS1ibG93ZmlzaC03OS5jbGVyay5hY2NvdW50cy5kZXYk"
declare -x CLERK_SECRET_KEY="sk_test_KGj9f6Y5oINL566YqmZsCoHNAUKLm1a1KU1AKGgi6j"
declare -x CODEX_HOME="/home/runner/workspace/codex-user"
declare -x CODEX_MANAGED_BY_NPM="1"
declare -x CODEX_MANAGED_PACKAGE_ROOT="/home/runner/workspace/.config/npm/node_global/lib/node_modules/@openai/codex"
declare -x COLORTERM="truecolor"
declare -x CONNECTORS_HOSTNAME="connectors.replit.com"
declare -x DATABASE_URL="postgresql://postgres:password@helium/heliumdb?sslmode=disable"
declare -x DEFAULT_OBJECT_STORAGE_BUCKET_ID="replit-objstore-848a54d7-2696-4eb5-99d3-067ced6c60f6"
declare -x DIDIT_API_KEY="Un8g0dfvAaT8TqyxCB8RusEab7b8wZMpycfdFosVnY8"
declare -x DIDIT_ENVIRONMENT="sandbox"
declare -x DIDIT_ID_WORKFLOW_ID="1c3b68f7-feb6-4102-b8f6-d74ac88ceb6d"
declare -x DIDIT_LIVE_API_KEY="Z_0TheOZz5HmsGp3rflFBH7SV0bo8mWlGqTKEjoJDSc"
declare -x DIDIT_TEST_USER_IDS="61079,33737"
declare -x DIDIT_WEBHOOK_SECRET="8YuHTDUpL-JMPFpJKepoA1ZFFC5u2cEJNE_R7oYLWdk"
declare -x DIDIT_WORKFLOW_ID="64fe50ae-dff0-484d-9786-c95a0652ea1b"
declare -x DISPLAY=":0"
declare -x DOCKER_CONFIG="/home/runner/workspace/.config/docker"
declare -x EXPO_PUBLIC_REVENUECAT_IOS_KEY="appl_KnVTELIQbHnPWUMdANcMDywzGxn"
declare -x EXPO_PUBLIC_REVENUECAT_MODE="store"
declare -x EXPO_TOKEN="GToQnFvT-LmgCEZITEqpZa6VKoNUyhBnuYibZfQP"
declare -x GIT_ASKPASS="replit-git-askpass"
declare -x GIT_CONFIG_GLOBAL="/run/replit/user/35023395/.config/git/config"
declare -x GIT_CONFIG_SYSTEM="/run/replit/user/35023395/.config/git/replit-fallback-config"
declare -x GIT_EDITOR="replit-git-editor"
declare -x GLIBC_TUNABLES="glibc.rtld.optional_static_tls=10000"
declare -x GOOGLE_TRANSLATE_API_KEY="AIzaSyB7qGrK6ZB0ykogMMbCNjnN4F6onzFbt_s"
declare -x GOPROXY="http://package-firewall.replit.internal/go/"
declare -x GOSUMDB="off"
declare -x HISTCONTROL="ignoredups"
declare -x HISTFILE="/run/replit/user/35023395/.bash_history"
declare -x HISTFILESIZE="100000"
declare -x HISTSIZE="10000"
declare -x HOME="/home/runner"
declare -x LANG="en_US.UTF-8"
declare -x LD_AUDIT="/nix/store/sj11ljhx4n79h9g0167f8lg8hp7n545m-replit_rtld_loader-1/rtld_loader.so"
declare -x LIBGL_DRIVERS_PATH="/nix/store/l4myp7qn0q9bqgmkqq4vnnii22ql1r68-mesa-25.0.7/lib/dri"
declare -x LOCALE_ARCHIVE="/usr/lib/locale/locale-archive"
declare -x LS_COLORS="rs=0:di=01;34:ln=01;36:mh=00:pi=40;33:so=01;35:do=01;35:bd=40;33;01:cd=40;33;01:or=40;31;01:mi=00:su=37;41:sg=30;43:ca=00:tw=30;42:ow=34;42:st=37;44:ex=01;32:*.7z=01;31:*.ace=01;31:*.alz=01;31:*.apk=01;31:*.arc=01;31:*.arj=01;31:*.bz=01;31:*.bz2=01;31:*.cab=01;31:*.cpio=01;31:*.crate=01;31:*.deb=01;31:*.drpm=01;31:*.dwm=01;31:*.dz=01;31:*.ear=01;31:*.egg=01;31:*.esd=01;31:*.gz=01;31:*.jar=01;31:*.lha=01;31:*.lrz=01;31:*.lz=01;31:*.lz4=01;31:*.lzh=01;31:*.lzma=01;31:*.lzo=01;31:*.pyz=01;31:*.rar=01;31:*.rpm=01;31:*.rz=01;31:*.sar=01;31:*.swm=01;31:*.t7z=01;31:*.tar=01;31:*.taz=01;31:*.tbz=01;31:*.tbz2=01;31:*.tgz=01;31:*.tlz=01;31:*.txz=01;31:*.tz=01;31:*.tzo=01;31:*.tzst=01;31:*.udeb=01;31:*.war=01;31:*.whl=01;31:*.wim=01;31:*.xz=01;31:*.z=01;31:*.zip=01;31:*.zoo=01;31:*.zst=01;31:*.avif=01;35:*.jpg=01;35:*.jpeg=01;35:*.jxl=01;35:*.mjpg=01;35:*.mjpeg=01;35:*.gif=01;35:*.bmp=01;35:*.pbm=01;35:*.pgm=01;35:*.ppm=01;35:*.tga=01;35:*.xbm=01;35:*.xpm=01;35:*.tif=01;35:*.tiff=01;35:*.png=01;35:*.svg=01;35:*.svgz=01;35:*.mng=01;35:*.pcx=01;35:*.mov=01;35:*.mpg=01;35:*.mpeg=01;35:*.m2v=01;35:*.mkv=01;35:*.webm=01;35:*.webp=01;35:*.ogm=01;35:*.mp4=01;35:*.m4v=01;35:*.mp4v=01;35:*.vob=01;35:*.qt=01;35:*.nuv=01;35:*.wmv=01;35:*.asf=01;35:*.rm=01;35:*.rmvb=01;35:*.flc=01;35:*.avi=01;35:*.fli=01;35:*.flv=01;35:*.gl=01;35:*.dl=01;35:*.xcf=01;35:*.xwd=01;35:*.yuv=01;35:*.cgm=01;35:*.emf=01;35:*.ogv=01;35:*.ogx=01;35:*.aac=00;36:*.au=00;36:*.flac=00;36:*.m4a=00;36:*.mid=00;36:*.midi=00;36:*.mka=00;36:*.mp3=00;36:*.mpc=00;36:*.ogg=00;36:*.ra=00;36:*.wav=00;36:*.oga=00;36:*.opus=00;36:*.spx=00;36:*.xspf=00;36:*~=00;90:*#=00;90:*.bak=00;90:*.crdownload=00;90:*.dpkg-dist=00;90:*.dpkg-new=00;90:*.dpkg-old=00;90:*.dpkg-tmp=00;90:*.old=00;90:*.orig=00;90:*.part=00;90:*.rej=00;90:*.rpmnew=00;90:*.rpmorig=00;90:*.rpmsave=00;90:*.swp=00;90:*.tmp=00;90:*.ucf-dist=00;90:*.ucf-new=00;90:*.ucf-old=00;90:"
declare -x NIXPKGS_ALLOW_UNFREE="1"
declare -x NIX_PATH="nixpkgs=/home/runner/.nix-defexpr/channels/nixpkgs-stable-25_05:/home/runner/.nix-defexpr/channels"
declare -x NPM_CONFIG_REGISTRY="http://package-firewall.replit.internal/npm/"
declare -x PATH="/home/runner/workspace/codex-user/tmp/arg0/codex-arg0U1Ay0K:/home/runner/workspace/codex-user/packages/app-server-daemon/releases/0.160.0-x86_64-unknown-linux-musl/codex-path:/home/runner/workspace/codex-user/tmp/arg0/codex-arg0Vk62Al:/home/runner/workspace/.config/npm/node_global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex-path:/nix/store/bgwr5i8jf8jpg75rr53rz3fqv5k8yrwp-postgresql-16.10/bin:/home/runner/workspace/.pythonlibs/bin:/nix/store/yp3s28b4xjvcq53wapb1v7hv5hlmmmma-python-wrapped-0.1.0/bin:/nix/store/59w24ywxs5lny5n9hx2zk1g29yy49iq4-python3.13-pip-25.0.1/bin:/nix/store/zv4va3swx5qcnlmx801p63n7jx59fgpl-python3.13-poetry-2.2.1/bin:/nix/store/cl0zldpnlc6k0f4jkl41vh977y4m13bq-uv-0.9.24/bin:/nix/store/17prmkcmwjif1sbpgpfb12dn94psc4gd-npx/bin:/home/runner/workspace/.config/npm/node_global/bin:/home/runner/workspace/node_modules/.bin:/nix/store/s7awkfc4pym4zj139fsxrjs5xwf5hhnd-nodejs-24.13.0-wrapped/bin:/nix/store/1xk3mgscq548ypyrgm2n5kwdii92w9ql-bun-1.3.6/bin:/nix/store/61lr9izijvg30pcribjdxgjxvh3bysp4-pnpm-10.26.1/bin:/nix/store/23078nfww258q1vjxbmyak0svvxcvj4s-yarn-1.22.22/bin:/nix/store/8sa75mbvbn3kxicggyyjggmkigvzddks-prettier-3.6.2/bin:/nix/store/c8hr2f0b0dm685yx1dkp6bw24bpx495n-graalvm19-ce-22.3.1/bin:/nix/store/4lslm4qgsyjmpdw64w0a8q5bdmlzjvjd-apache-maven-3.8.6/bin:/nix/store/2bjv75gl00rq6rr4ff7mj44kpwbncaj8-pid1/bin:/nix/store/mdyqjkxahw1ggdarl1pxzn35kasz6y53-replit-runtime-path/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/repl/tools/bin"
declare -x PGDATABASE="heliumdb"
declare -x PGHOST="helium"
declare -x PGPASSWORD="password"
declare -x PGPORT="5432"
declare -x PGUSER="postgres"
declare -x PIP_INDEX_URL="http://package-firewall.replit.internal/pypi/simple/"
declare -x PIP_TRUSTED_HOST="package-firewall.replit.internal package-firewall.replit.local"
declare -x PRIVATE_OBJECT_DIR="/replit-objstore-848a54d7-2696-4eb5-99d3-067ced6c60f6/.private"
declare -x PROMPT_DIRTRIM="2"
declare -x PUBLIC_OBJECT_SEARCH_PATHS="/replit-objstore-848a54d7-2696-4eb5-99d3-067ced6c60f6/public"
declare -x PULSE_PRIVACY_URL="https://254cd483-13a8-46a7-aec3-b50e106f5db3-00-29qgy6snub3n8.kirk.replit.dev/api/site/privacy"
declare -x PYTHONPATH="/nix/store/y50fwh2sha400s38m12psfxpvk2c8w39-sitecustomize/lib/python/site-packages"
declare -x PYTHONUSERBASE="/home/runner/workspace/.pythonlibs"
declare -x PYTHON_LD_LIBRARY_PATH="/nix/store/pya3p1ihjm446jpqpql93542cirqyn23-cpplibs/lib:/nix/store/c2qsgf2832zi4n29gfkqgkjpvmbmxam6-zlib-1.3.1/lib:/nix/store/f7rcazhd826xlcz43il4vafv28888cgj-glib-2.86.3/lib:/nix/store/ii3ybky5dqjikcrw7vdnh1j76ssy0ycm-libx11-1.8.12/lib:/nix/store/zshby6nalhw4mvap0rr97hv042808c2k-libxext-1.3.6/lib:/nix/store/0r6d7iw0q9wgxxj28zy87n1gjwvk0klp-libxinerama-1.1.5/lib:/nix/store/bb5xxw11ndww7iivcmdpxga9n1da24vg-libxcursor-1.2.3/lib:/nix/store/dyn0y5clf5b556yqwmj4841h43hz75p6-libxrandr-1.5.4/lib:/nix/store/x1f9a0qsj6a1y5nf178naagm2vbxnazc-libxi-1.8.2/lib:/nix/store/pv432a54y6di3n12iqix2dglkswvq1px-libxxf86vm-1.1.6/lib"
declare -x RC_API_KEY="test_QKYTccFSvTndCakDDoyceNmngDl"
declare -x REPLIT_ARTIFACT_ROUTER="/nix/store/addw3083n1h747n2ziq5ngig268jli2b-artifact-router-0.1.0/bin/artifact-router"
declare -x REPLIT_ASKPASS_PID2_SESSION="letstalklocal-xZOF"
declare -x REPLIT_BASHRC="/nix/store/6g35cyppas5adh6hv6ys2zsys5ymq5ki-replit-bashrc/bashrc"
declare -x REPLIT_CLI="/nix/store/x9f2xphdj9sg5rpqd81ji8rxillgrq7a-replit-cli-0.0.1/bin/replit"
declare -x REPLIT_CLUSTER="kirk"
declare -x REPLIT_CONNECTORS_HOSTNAME="connectors.replit.com"
declare -x REPLIT_CONNECTOR_TOOLS_PATH="/repl/tools/bin"
declare -x REPLIT_CONTAINER="repl"
declare -x REPLIT_DB_URL="https://kv.replit.com/v0/eyJhbGciOiJIUzUxMiIsImlzcyI6InJlcGx2aXNvciIsImtpZCI6InByb2Q6MSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJyZXBsdmlzb3IiLCJleHAiOjE3OTEyNTQzNDgsImlhdCI6MTc5MDk2NjM0OCwiZGF0YWJhc2VfaWQiOiIyNTRjZDQ4My0xM2E4LTQ2YTctYWVjMy1iNTBlMTA2ZjVkYjMifQ.vmxeC6F5cWHMpf-CICtl2AV8ZSnBSxvj9pNQSk53z6cog65tREGK_4MX7PntXH1DRfLJxYC304F6m_u3NQbh4A"
declare -x REPLIT_DEV_DOMAIN="254cd483-13a8-46a7-aec3-b50e106f5db3-00-29qgy6snub3n8.kirk.replit.dev"
declare -x REPLIT_DOMAINS="254cd483-13a8-46a7-aec3-b50e106f5db3-00-29qgy6snub3n8.kirk.replit.dev"
declare -x REPLIT_ENVIRONMENT="production"
declare -x REPLIT_EXPO_DEV_DOMAIN="254cd483-13a8-46a7-aec3-b50e106f5db3-00-29qgy6snub3n8.expo.kirk.replit.dev"
declare -x REPLIT_EXPO_SESSION_SECRET="{\"id\":\"04c54bc6-e3a8-4be4-be06-0f3827e5e782\",\"version\":2}"
declare -x REPLIT_HELIUM_ENABLED="true"
declare -x REPLIT_HELIUM_USER_QUOTA_BYTES="21474836480"
declare -x REPLIT_LD_AUDIT="/nix/store/sj11ljhx4n79h9g0167f8lg8hp7n545m-replit_rtld_loader-1/rtld_loader.so"
declare -x REPLIT_NIX_CHANNEL="stable-25_05"
declare -x REPLIT_PID1_NIX_BIN_DIR="/nix/store/asx9z0yjzyh0h9amkx4zxn25qb3kp9q5-determinate-nix-3.11.2/bin"
declare -x REPLIT_PID1_VERSION="0.0.666"
declare -x REPLIT_PID2="true"
declare -x REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE="/nix/store/71577rskzyhch3axhdqx7faygc2xyn4v-playwright-browsers-1.55.0-with-cjk/chromium-1187/chrome-linux/chrome"
declare -x REPLIT_PYTHONPATH="/home/runner/workspace/.pythonlibs/lib/python3.13/site-packages:/nix/store/bq3172qx0c68yv0i4wy51y1bzln4wndr-python3.13-setuptools-80.9.0/lib/python3.13/site-packages"
declare -x REPLIT_RIPPKGS_INDICES="/nix/store/cg6q7dm7h9jp20vwj79ahnbsd9cs6iay-rippkgs-indices"
declare -x REPLIT_RTLD_LOADER="1"
declare -x REPLIT_RUN_PATH="/run/replit"
declare -x REPLIT_SEMGREP_RUNTIME_PATH="/nix/store/wgn2g60i9rkqdh7hklmg76cfvi68r6vl-pid2-runtime-path/bin"
declare -x REPLIT_SESSION="letstalklocal-xZOF"
declare -x REPLIT_USER="letstalklocal"
declare -x REPLIT_USERID="35023395"
declare -x REPLIT_USER_RUN="/run/replit/user/35023395"
declare -x REPL_HOME="/home/runner/workspace"
declare -x REPL_ID="254cd483-13a8-46a7-aec3-b50e106f5db3"
declare -x REPL_IDENTITY="v2.public.Q2lReU5UUmpaRFE0TXkweE0yRTRMVFEyWVRjdFlXVmpNeTFpTlRCbE1UQTJaalZrWWpNU0RXeGxkSE4wWVd4cmJHOWpZV3dhQlZCMWJITmxJaVF5TlRSalpEUTRNeTB4TTJFNExUUTJZVGN0WVdWak15MWlOVEJsTVRBMlpqVmtZak00bzlUWkVISVhDZ295YldVNGRXTjJNV2N3RUFFcUJ6STRNVFV6T1RkYUJnb0VhMmx5YXc9PWghVMRLNPzj22ck6-kpWCnCOPH76qjc25q-QI0YM0MWIJz-TQKultO7SIEBPFgSKYH9I-QY5q-udIcrKrxoPwQ.R0FFaUNYSmxjR3gyYVhOdmNoS3hDSFl5TG5CMVlteHBZeTVSTW1SNlUxaFdiVlpET0hoVlZteFNUMFpDTVU5WFZsTlRWWGhFVkZkcmNtRXlVbHBTTUZaTFZVTTVNbGRIZEdoUlYyaHVVbXRrY0ZkVmRFdFNSV3Q0Vkd0a1QyRXdOVVZhTTNCTlZrVldObGRXVW01a1JUVkZWMjFvVDJWVVJtOVhiR1JPWld0NFdGTlVSazVTTVZZMFZGVlNZV0pWTlZoVmJXeE9aVWM1VVZKWFkzaGpNWEJaVlc1d2ExSXdXbnBaVkVvMFpHeHJlVkp1VGtoYU1WVXdZbnBzVlZkclZrTmlNWEJTWVVkT1RGRXljRXRrUm5CVllVUkdXazB4YkRSWGJuQkNWVlZHVkdJd2FFNWhiV1EwVkd4U1RrNVZOVFJpTUdSS1dqRktlVmxXYUV0amEyUnVVMWhHUWxFd2EzaFpXSEJLWkZkT1NWWnRiR2xTTW5oeFZFZDBNRk14WkZsalJYaFRZbFJXYUZsVVJuTk5SbVJ6VjI1YVdGSXdXbEpXVmsxNFV6Sk9WazVWT1d0aGJFcElXa2R3YzA1R1ZYaFZhMnhZVW1wcmQxbHFTWGhVUm1kM1ZGUlNZVkl6VFRrek9VRnpVR0V0YlUwMWVVeHlNa3BoU1hGbUxYTnpObEpFVkhoNmNXdERWSFJEUjJwblR6aHBlbEZCZUhnME9Hc3pTMTlVYmtjdFIzZHpTV2hLTldGTmVXNXBOR1UzV1V3d1RFbDZWSFkyWDNGUVNUaENkeTVTTUVaR1lWVktkRlJ1V21saVZFWnZXVzFvVFZsclJuVlhXR3hOWW10SmVGZFhNVFJqUm13MVRsWktUbUpXU1RKV1ZFWnJUVWRXZEZOc1dsUmlia0pYVm0weE5GVXhVbkpWYlVaT1ZtNUNWMVV5ZEU5V1JscFpZVVZXVm1WclNuSlZha0V4VTFaR2NsTnNXazVTYkhCVFZtMXdUMWxYVWxkaU0yaFRZbGRvVTFacVNtOWtWbFpZWkVkMGFXSkZOVmhaYTFaUFZtMUtWV0pGVmxaaGEwcElXa2Q0YzFac1NuVlNiRXBYVmxoQ1NsWXljRU5qTVdSelVteG9hRk5HY0ZOVVZXUlRVVEZhUjFwRlpGSmlWVnBKVjJ0VmVGVXdNWFJWYTNSWFRWWmFWRlZVU2twa01WSnlZVVpLVjJFeGNIWldWbHByWWpKS2MxUnVTbWxUUlZwWVdXMTBkMVF4YkZkVmJHUk9UVmhDU0ZkclZqQmhhekZ5VjJ4c1YxSnRhRmhXUkVaaFpFZFdTV05HWkZkaVZrcEpWa1pTUzFReVRYbFRhbHBXWVhwc1dGUlhlRXRpTVZsNVRWUlNWRTFyV2tkVVZsWnJWa2RLUmxkc1dscFdla1V3VjFaYWMwNXNSbFZTYlhCcFVsaENObFpFUmxkWlYwVjVVMnhzVmxaRldsZFphMXBoWTJ4d1NHVkZXbXhTYmtKR1ZqSXhkMkZIUlhoalJ6bFhZV3RhVkZWNlJrNWxSbHB6VTJ4R1YxSkZTak5XTW5SaFYyMU9kR05GTVZCWFJUUjZXa1ZXV2s1V2NFVlNXRkpwWWxSV1VWUXdaR0ZWYlVwWVlVUktWRkpXY0hoV2ExWnlaRWRTUldGRmNHbGlWbkJSVjBSSmVGWlZNWFJaZWxKcVYwaENSbFZyWkZaT1JscEZZa1pTYUUxV1NqWlhiWGh2WWxkV2NtSjZRbGhXVlRFMlYyMXpkMlZzWkZaT1dFcFVWa2RTV1ZkWGEzZE9Wa3B5VlcwNVQyRlVSa3hVYWtrMVVrVjRjMU5ZWkZOaE1YQnZWbXhXZDAxR1draE9WMFpvVmpCd1ZsVnRNRFZYYlVwWVZXcEtWbUZyY0ZCVk1WcFBaRlprZEZKc1RsTmxiV2N3"
declare -x REPL_IDENTITY_KEY="k2.secret.AO7tB2QbD0lf_hLfB7_HfZ2fnZv611_qV92H3YXtM4EoljMoWdmRi1lWhdo9D4mo02_gW_3FJMdf-2iYr8Lx2Q"
declare -x REPL_IN_MICROVM="true"
declare -x REPL_LANGUAGE="nix"
declare -x REPL_ORG_ID="2me8ucv1g0"
declare -x REPL_ORG_IS_ENTERPRISE="false"
declare -x REPL_ORG_TYPE="PERSONAL"
declare -x REPL_OWNER="letstalklocal"
declare -x REPL_OWNER_ID="35023395"
declare -x REPL_PUBKEYS="{\"crosis-ci\":\"7YlpcYh82oR9NSTtSYtR5jDL4onNzCGJGq6b+9CuZII=\",\"crosis-ci:1\":\"7YlpcYh82oR9NSTtSYtR5jDL4onNzCGJGq6b+9CuZII=\",\"crosis-ci:latest\":\"7YlpcYh82oR9NSTtSYtR5jDL4onNzCGJGq6b+9CuZII=\",\"prod\":\"tGsjlu/BJvWTgvMaX7acuUb7AO1dXOrRiuk7y083RFE=\",\"prod:1\":\"tGsjlu/BJvWTgvMaX7acuUb7AO1dXOrRiuk7y083RFE=\",\"prod:3\":\"9+MCOSHQSQlcodXoot8dC8NLhc862nLkx1/VMsbY2h8=\",\"prod:4\":\"8uGN+vfszlnV93/HCSHlVLG0xddMlPkir1Ni4JKT4+w=\",\"prod:5\":\"9+MCOSHQSQlcodXoot8dC8NLhc862nLkx1/VMsbY2h8=\",\"prod:latest\":\"tGsjlu/BJvWTgvMaX7acuUb7AO1dXOrRiuk7y083RFE=\",\"vault-goval-token\":\"D5jJoMx1Ml54HM92NLgXl+MzptwDqbSsfyFG6f52g9E=\",\"vault-goval-token:1\":\"D5jJoMx1Ml54HM92NLgXl+MzptwDqbSsfyFG6f52g9E=\",\"vault-goval-token:latest\":\"D5jJoMx1Ml54HM92NLgXl+MzptwDqbSsfyFG6f52g9E=\"}"
declare -x REPL_SLUG="workspace"
declare -x REVENUECAT_API_V2_SECRET_KEY="sk_kwYPFIYoqAgJefmPSTHEVdldpuNgI"
declare -x REVENUECAT_APP_IDS="app0722e3199f,app1937357464"
declare -x REVENUECAT_ENVIRONMENT="SANDBOX"
declare -x REVENUECAT_WEBHOOK_AUTH="Bearer uDYtSFLe3MaJMJT83ymD_NKob9cR9JBCoATp5s0zmvY2wu9q1AZW9FXkL2yhq3je"
declare -x SESSION_SECRET="ZeZOXRpT7riSwO68MqzQPGwL9/3oIz/lbK8Bs+BEY4wKwgKX+pGVXcENVePTVzdSahUMc63VLju1atwrXjooLQ=="
declare -x SHLVL="2"
declare -x TERM="xterm-256color"
declare -x TZDIR="/etc/zoneinfo"
declare -x UV_PROJECT_ENVIRONMENT="/home/runner/workspace/.pythonlibs"
declare -x VERIFICATION_PUBLIC_ORIGIN="https://254cd483-13a8-46a7-aec3-b50e106f5db3-00-29qgy6snub3n8.kirk.replit.dev"
declare -x VITE_CLERK_PUBLISHABLE_KEY="pk_test_cHJpbWFyeS1ibG93ZmlzaC03OS5jbGVyay5hY2NvdW50cy5kZXYk"
declare -x XDG_CACHE_HOME="/home/runner/workspace/.cache"
declare -x XDG_CONFIG_HOME="/home/runner/workspace/.config"
declare -x XDG_DATA_DIRS="/nix/store/mdyqjkxahw1ggdarl1pxzn35kasz6y53-replit-runtime-path/share"
declare -x XDG_DATA_HOME="/home/runner/workspace/.local/share"
declare -x YARN_NPM_REGISTRY_SERVER="http://package-firewall.replit.internal/npm/"
declare -x YARN_REGISTRY="http://package-firewall.replit.internal/npm/"
declare -x __EGL_VENDOR_LIBRARY_FILENAMES="/nix/store/l4myp7qn0q9bqgmkqq4vnnii22ql1r68-mesa-25.0.7/share/glvnd/egl_vendor.d/50_mesa.json"
declare -x npm_config_prefix="/home/runner/workspace/.config/npm/node_global"
declare -x npm_config_registry="http://package-firewall.replit.internal/npm/"
