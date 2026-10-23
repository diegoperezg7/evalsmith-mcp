# Records docs/assets/cli.gif. Run from the repository root after `npm run build`: vhs docs/cli.tape
Output docs/assets/cli.gif
Set Shell zsh
Set FontSize 13
Set Width 1100
Set Height 960
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type "alias evalsmith='node dist/cli/index.js' && export PS1='$ ' && clear"
Enter
Show

Type "evalsmith run examples/evalsmith.yaml --format table"
Sleep 400ms
Enter
Sleep 6s

Type "clear && evalsmith run examples/evalsmith.yaml --format table --fail-under recall@5=0.95; echo exit=$?"
Sleep 400ms
Enter
Sleep 6s
