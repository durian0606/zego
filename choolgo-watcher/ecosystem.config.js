module.exports = {
    apps: [{
        name: 'choolgo-watcher',
        script: 'index.js',
        cwd: __dirname,
        watch: false,
        autorestart: true,
        max_restarts: 10,
        restart_delay: 5000,
        // 크래시 후 5초 대기 후 재시작, 최대 10회
        exp_backoff_restart_delay: 1000,
        // 로그 설정
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        error_file: './logs/error.log',
        out_file: './logs/out.log',
        merge_logs: true,
        // 환경변수 (필요 시 여기서 오버라이드)
        env: {
            NODE_ENV: 'production',
        },
    }],
};
