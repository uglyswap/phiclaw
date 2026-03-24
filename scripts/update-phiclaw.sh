#!/usr/bin/env bash
#
# update-phiclaw.sh — Auto-updater complet pour PhiClaw
#
# Synchronise le fork uglyswap/phiclaw avec upstream openclaw/openclaw,
# rebuild l'image Docker, et redéploie le container avec rollback automatique.
#
# Usage :
#   ./scripts/update-phiclaw.sh              # Mode normal
#   ./scripts/update-phiclaw.sh --force       # Force rebuild même si à jour
#   ./scripts/update-phiclaw.sh --dry-run     # Simule sans appliquer
#   ./scripts/update-phiclaw.sh --notify      # Envoie une notification (via curl webhook)
#
# Prérequis :
#   - Docker avec accès au socket
#   - Git configuré avec credentials GitHub
#   - Exécuté depuis l'HÔTE (ou un container avec accès Docker socket)
#
# Ce script DOIT être lancé depuis le répertoire racine du repo PhiClaw,
# ou le chemin du repo peut être passé via PHICLAW_REPO_DIR.
#
# ─── Configuration ──────────────────────────────────────────────────
set -euo pipefail

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration (overridable via env)
PHICLAW_REPO_DIR="${PHICLAW_REPO_DIR:-/tmp/phiclaw}"
PHICLAW_IMAGE="${PHICLAW_IMAGE:-phiclaw:local}"
PHICLAW_CONTAINER="${PHICLAW_CONTAINER:-phiclaw}"
PHICLAW_HOST_PORT="${PHICLAW_HOST_PORT:-18800}"
PHICLAW_CONTAINER_PORT="${PHICLAW_CONTAINER_PORT:-18789}"
PHICLAW_CONFIG_VOLUME="${PHICLAW_CONFIG_VOLUME:-phiclaw_phiclaw-config}"
PHICLAW_WORKSPACE_VOLUME="${PHICLAW_WORKSPACE_VOLUME:-phiclaw_phiclaw-workspace}"
PHICLAW_UPSTREAM_URL="${PHICLAW_UPSTREAM_URL:-https://github.com/openclaw/openclaw.git}"
PHICLAW_UPSTREAM_BRANCH="${PHICLAW_UPSTREAM_BRANCH:-main}"
PHICLAW_LOG_FILE="${PHICLAW_LOG_FILE:-/tmp/phiclaw-update.log}"
PHICLAW_NOTIFY_WEBHOOK="${PHICLAW_NOTIFY_WEBHOOK:-}"
PHICLAW_HEALTH_TIMEOUT="${PHICLAW_HEALTH_TIMEOUT:-120}"   # seconds
PHICLAW_TELEGRAM_TIMEOUT="${PHICLAW_TELEGRAM_TIMEOUT:-60}" # seconds

# BuildKit config
BUILDX_VERSION="${BUILDX_VERSION:-v0.21.2}"
BUILDX_ARCH="${BUILDX_ARCH:-linux-amd64}"
BUILDX_URL="https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.${BUILDX_ARCH}"

# Fichiers PhiClaw à protéger lors du merge upstream
PROTECTED_PATHS=(
    "agents/"
    "src/orchestrator/"
    "src/auto-reply/reply/commands-phiclaw.ts"
    "phiclaw.config.json"
    "scripts/transcribe.sh"
    "scripts/setup-audio.sh"
    "scripts/setup-qmd.sh"
    "scripts/check-qmd.sh"
    "scripts/entrypoint.sh"
    "scripts/update-phiclaw.sh"
    "skills/ontology/"
    "README.md"
)

# ─── Flags ──────────────────────────────────────────────────────────
FORCE=false
DRY_RUN=false
NOTIFY=false

for arg in "$@"; do
    case "$arg" in
        --force)   FORCE=true ;;
        --dry-run) DRY_RUN=true ;;
        --notify)  NOTIFY=true ;;
        --help|-h)
            echo "Usage: $0 [--force] [--dry-run] [--notify]"
            echo ""
            echo "Options:"
            echo "  --force     Force rebuild même si le fork est à jour"
            echo "  --dry-run   Simule les étapes sans rien modifier"
            echo "  --notify    Envoie une notification webhook à la fin"
            echo ""
            echo "Environment variables:"
            echo "  PHICLAW_REPO_DIR          Repo directory (default: /tmp/phiclaw)"
            echo "  PHICLAW_IMAGE             Docker image name (default: phiclaw:local)"
            echo "  PHICLAW_CONTAINER         Container name (default: phiclaw)"
            echo "  PHICLAW_HOST_PORT         Host port (default: 18800)"
            echo "  PHICLAW_CONTAINER_PORT    Container port (default: 18789)"
            echo "  PHICLAW_NOTIFY_WEBHOOK    Webhook URL for notifications"
            echo "  PHICLAW_HEALTH_TIMEOUT    Health check timeout in seconds (default: 120)"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            exit 1
            ;;
    esac
done

# ─── Logging ────────────────────────────────────────────────────────
log() {
    local level="$1"
    shift
    local timestamp
    timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
    local color=""
    case "$level" in
        INFO)  color="${GREEN}" ;;
        WARN)  color="${YELLOW}" ;;
        ERROR) color="${RED}" ;;
        STEP)  color="${CYAN}" ;;
        *)     color="${NC}" ;;
    esac
    echo -e "${color}[${timestamp}] [${level}]${NC} $*" | tee -a "$PHICLAW_LOG_FILE"
}

notify() {
    local message="$1"
    local status="${2:-info}"
    if [[ "$NOTIFY" == true && -n "$PHICLAW_NOTIFY_WEBHOOK" ]]; then
        curl -s -X POST "$PHICLAW_NOTIFY_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"text\": \"[PhiClaw Updater] ${message}\", \"status\": \"${status}\"}" \
            >/dev/null 2>&1 || true
    fi
}

die() {
    log ERROR "$@"
    notify "❌ ÉCHEC: $*" "error"
    exit 1
}

# ─── Fonctions utilitaires ──────────────────────────────────────────

# Vérifie et installe docker buildx si nécessaire
ensure_buildx() {
    log STEP "═══ Étape 1/15 : Vérification de Docker BuildKit ═══"

    if docker buildx version >/dev/null 2>&1; then
        local version
        version="$(docker buildx version 2>&1 | head -1)"
        log INFO "Docker BuildKit déjà installé : ${version}"
        return 0
    fi

    log WARN "Docker BuildKit non trouvé. Installation..."

    if [[ "$DRY_RUN" == true ]]; then
        log INFO "[DRY-RUN] Installerait BuildKit ${BUILDX_VERSION}"
        return 0
    fi

    mkdir -p ~/.docker/cli-plugins/
    if ! curl -fsSL "$BUILDX_URL" -o ~/.docker/cli-plugins/docker-buildx; then
        die "Impossible de télécharger docker-buildx depuis ${BUILDX_URL}"
    fi
    chmod +x ~/.docker/cli-plugins/docker-buildx

    if docker buildx version >/dev/null 2>&1; then
        log INFO "Docker BuildKit installé avec succès : $(docker buildx version 2>&1 | head -1)"
    else
        die "Docker BuildKit installé mais non fonctionnel"
    fi
}

# Configure le remote upstream s'il n'existe pas
ensure_upstream() {
    log STEP "═══ Étape 2/15 : Configuration du remote upstream ═══"

    cd "$PHICLAW_REPO_DIR" || die "Repo PhiClaw introuvable : ${PHICLAW_REPO_DIR}"

    if ! git remote get-url upstream >/dev/null 2>&1; then
        log INFO "Ajout du remote upstream : ${PHICLAW_UPSTREAM_URL}"
        if [[ "$DRY_RUN" == false ]]; then
            git remote add upstream "$PHICLAW_UPSTREAM_URL"
        fi
    else
        local current_url
        current_url="$(git remote get-url upstream)"
        log INFO "Remote upstream déjà configuré : ${current_url}"
    fi
}

# Fetch upstream
fetch_upstream() {
    log STEP "═══ Étape 3/15 : Fetch upstream ═══"

    cd "$PHICLAW_REPO_DIR"

    if [[ "$DRY_RUN" == true ]]; then
        log INFO "[DRY-RUN] Ferait git fetch upstream"
        return 0
    fi

    if ! git fetch upstream "$PHICLAW_UPSTREAM_BRANCH" 2>&1; then
        die "Impossible de fetch upstream/${PHICLAW_UPSTREAM_BRANCH}"
    fi

    log INFO "Upstream fetché avec succès"
}

# Compare les commits : retourne 0 si des updates sont disponibles
check_updates() {
    log STEP "═══ Étape 4/15 : Comparaison des commits ═══"

    cd "$PHICLAW_REPO_DIR"

    local local_head upstream_head
    local_head="$(git rev-parse HEAD)"
    upstream_head="$(git rev-parse upstream/${PHICLAW_UPSTREAM_BRANCH})"

    log INFO "Commit local  (HEAD) : ${local_head:0:12}"
    log INFO "Commit upstream      : ${upstream_head:0:12}"

    # Vérifie si upstream est déjà un ancêtre de HEAD (= déjà mergé)
    if git merge-base --is-ancestor "$upstream_head" HEAD 2>/dev/null; then
        if [[ "$FORCE" == true ]]; then
            log WARN "Déjà à jour mais --force spécifié. On continue."
            return 0
        fi
        log INFO "✅ Already up to date — aucun nouveau commit upstream."
        notify "✅ PhiClaw déjà à jour (${local_head:0:12})" "ok"
        return 1
    fi

    # Compter les commits en avance
    local ahead_count
    ahead_count="$(git rev-list HEAD..upstream/${PHICLAW_UPSTREAM_BRANCH} --count)"
    log INFO "📦 ${ahead_count} nouveau(x) commit(s) upstream à intégrer"

    return 0
}

# Merge upstream avec protection des fichiers PhiClaw
merge_upstream() {
    log STEP "═══ Étape 5/15 : Merge upstream/main ═══"

    cd "$PHICLAW_REPO_DIR"

    if [[ "$DRY_RUN" == true ]]; then
        log INFO "[DRY-RUN] Ferait git merge upstream/${PHICLAW_UPSTREAM_BRANCH}"
        return 0
    fi

    # Sauvegarder le commit actuel pour rollback
    MERGE_ROLLBACK_COMMIT="$(git rev-parse HEAD)"
    export MERGE_ROLLBACK_COMMIT

    # Sauvegarder nos fichiers protégés avant le merge
    local backup_dir="/tmp/phiclaw-merge-backup-$(date +%s)"
    mkdir -p "$backup_dir"

    log INFO "Sauvegarde des fichiers protégés dans ${backup_dir}..."
    for path in "${PROTECTED_PATHS[@]}"; do
        local full_path="${PHICLAW_REPO_DIR}/${path}"
        if [[ -e "$full_path" ]]; then
            local backup_path="${backup_dir}/${path}"
            mkdir -p "$(dirname "$backup_path")"
            if [[ -d "$full_path" ]]; then
                cp -r "$full_path" "$backup_path"
            else
                cp "$full_path" "$backup_path"
            fi
            log INFO "  ✓ Sauvegardé : ${path}"
        fi
    done

    # Tenter le merge
    log INFO "Tentative de merge upstream/${PHICLAW_UPSTREAM_BRANCH}..."
    local merge_output
    if merge_output=$(git merge "upstream/${PHICLAW_UPSTREAM_BRANCH}" \
        --no-edit \
        -m "chore: merge upstream openclaw/openclaw $(date +%Y-%m-%d)" \
        2>&1); then
        log INFO "Merge réussi sans conflit"
    else
        log WARN "Merge avec conflits détectés. Tentative de résolution automatique..."

        # Vérifier s'il y a des conflits
        local conflicted_files
        conflicted_files="$(git diff --name-only --diff-filter=U 2>/dev/null || true)"

        if [[ -z "$conflicted_files" ]]; then
            die "Merge échoué sans conflits identifiables : ${merge_output}"
        fi

        log INFO "Fichiers en conflit :"
        echo "$conflicted_files" | while read -r file; do
            log INFO "  ⚠ ${file}"
        done

        # Résolution automatique : pour les fichiers protégés, garder les nôtres
        local unresolvable=false
        while IFS= read -r file; do
            local is_protected=false
            for protected in "${PROTECTED_PATHS[@]}"; do
                # Vérifier si le fichier est dans un chemin protégé
                if [[ "$file" == "$protected" || "$file" == "${protected}"* ]]; then
                    is_protected=true
                    break
                fi
            done

            if [[ "$is_protected" == true ]]; then
                log INFO "  → ${file} : conflit résolu (on garde le nôtre)"
                git checkout --ours "$file" 2>/dev/null || true
                git add "$file" 2>/dev/null || true
            else
                # Pour les fichiers non-protégés, prendre upstream
                log INFO "  → ${file} : conflit résolu (on prend upstream)"
                git checkout --theirs "$file" 2>/dev/null || true
                git add "$file" 2>/dev/null || true
            fi
        done <<< "$conflicted_files"

        # Vérifier s'il reste des conflits non résolus
        local remaining_conflicts
        remaining_conflicts="$(git diff --name-only --diff-filter=U 2>/dev/null || true)"

        if [[ -n "$remaining_conflicts" ]]; then
            log ERROR "Conflits irrésolus restants :"
            echo "$remaining_conflicts" | while read -r file; do
                log ERROR "  ✗ ${file}"
            done
            git merge --abort 2>/dev/null || true
            die "Merge avorté : conflits irrésolus. Intervention manuelle requise."
        fi

        # Commiter le merge résolu
        git commit --no-edit -m "chore: merge upstream openclaw/openclaw $(date +%Y-%m-%d) (auto-resolved)" 2>&1 || \
            die "Impossible de commiter le merge résolu"

        log INFO "Merge avec résolution automatique réussi"
    fi

    # Restaurer les fichiers protégés qui auraient pu être écrasés
    log INFO "Restauration des fichiers protégés..."
    for path in "${PROTECTED_PATHS[@]}"; do
        local backup_path="${backup_dir}/${path}"
        local full_path="${PHICLAW_REPO_DIR}/${path}"
        if [[ -e "$backup_path" ]]; then
            if [[ -d "$backup_path" ]]; then
                rm -rf "$full_path" 2>/dev/null || true
                cp -r "$backup_path" "$full_path"
            else
                cp "$backup_path" "$full_path"
            fi
        fi
    done

    # Si des fichiers protégés ont été restaurés et diffèrent, amend le merge
    if ! git diff --quiet 2>/dev/null; then
        git add -A
        git commit --amend --no-edit 2>&1 || true
        log INFO "Fichiers protégés restaurés et merge amendé"
    fi

    # Nettoyage du backup
    rm -rf "$backup_dir"

    log INFO "✅ Merge terminé avec succès"
}

# Push sur GitHub
push_changes() {
    log STEP "═══ Étape 6/15 : Push sur GitHub ═══"

    cd "$PHICLAW_REPO_DIR"

    if [[ "$DRY_RUN" == true ]]; then
        log INFO "[DRY-RUN] Ferait git push origin main"
        return 0
    fi

    if ! git push origin main 2>&1; then
        # Rollback le merge en cas d'échec du push
        if [[ -n "${MERGE_ROLLBACK_COMMIT:-}" ]]; then
            log WARN "Push échoué. Rollback du merge..."
            git reset --hard "$MERGE_ROLLBACK_COMMIT"
        fi
        die "Impossible de push sur GitHub"
    fi

    log INFO "✅ Push réussi sur GitHub"
}

# Build l'image Docker
build_image() {
    log STEP "═══ Étape 7/15 : Build de l'image Docker ═══"

    cd "$PHICLAW_REPO_DIR"

    if [[ "$DRY_RUN" == true ]]; then
        log INFO "[DRY-RUN] Ferait docker buildx build -t ${PHICLAW_IMAGE} --load ."
        return 0
    fi

    # Tag l'image actuelle comme rollback avant de build
    if docker image inspect "$PHICLAW_IMAGE" >/dev/null 2>&1; then
        log INFO "Tag de l'image actuelle comme phiclaw:rollback..."
        docker tag "$PHICLAW_IMAGE" "phiclaw:rollback"
    fi

    log INFO "Build en cours (cela peut prendre plusieurs minutes)..."
    local build_start
    build_start="$(date +%s)"

    if ! docker buildx build -t "$PHICLAW_IMAGE" --load . 2>&1 | tee -a "$PHICLAW_LOG_FILE"; then
        local build_duration=$(( $(date +%s) - build_start ))
        log ERROR "Build échoué après ${build_duration}s"

        # Rollback le merge
        if [[ -n "${MERGE_ROLLBACK_COMMIT:-}" ]]; then
            log WARN "Rollback du merge commit..."
            cd "$PHICLAW_REPO_DIR"
            git reset --hard "$MERGE_ROLLBACK_COMMIT"
            git push origin main --force 2>/dev/null || true
        fi

        die "Build Docker échoué — merge rollbacké"
    fi

    local build_duration=$(( $(date +%s) - build_start ))
    log INFO "✅ Build réussi en ${build_duration}s"
}

# Stop et supprime l'ancien container
stop_container() {
    log STEP "═══ Étape 8/15 : Arrêt de l'ancien container ═══"

    if [[ "$DRY_RUN" == true ]]; then
        log INFO "[DRY-RUN] Ferait docker stop/rm ${PHICLAW_CONTAINER}"
        return 0
    fi

    if docker ps -a --format '{{.Names}}' | grep -q "^${PHICLAW_CONTAINER}$"; then
        log INFO "Arrêt du container ${PHICLAW_CONTAINER}..."
        docker stop "$PHICLAW_CONTAINER" 2>/dev/null || true
        docker rm "$PHICLAW_CONTAINER" 2>/dev/null || true
        log INFO "Container arrêté et supprimé"
    else
        log INFO "Container ${PHICLAW_CONTAINER} non trouvé (rien à arrêter)"
    fi
}

# Redéploie le container
deploy_container() {
    log STEP "═══ Étape 9/15 : Déploiement du nouveau container ═══"

    if [[ "$DRY_RUN" == true ]]; then
        log INFO "[DRY-RUN] Déploierait le container ${PHICLAW_CONTAINER}"
        return 0
    fi

    # Fix permissions sur le volume de config
    log INFO "Fix des permissions sur le volume de config..."
    docker run --rm -v "${PHICLAW_CONFIG_VOLUME}:/data" alpine chown -R 1000:1000 /data 2>/dev/null || true

    log INFO "Lancement du container ${PHICLAW_CONTAINER}..."
    docker run -d \
        --name "$PHICLAW_CONTAINER" \
        -p "${PHICLAW_HOST_PORT}:${PHICLAW_CONTAINER_PORT}" \
        -v "${PHICLAW_CONFIG_VOLUME}:/home/node/.openclaw" \
        -v "${PHICLAW_WORKSPACE_VOLUME}:/home/node/.openclaw/workspace" \
        --restart unless-stopped \
        "$PHICLAW_IMAGE" \
        gateway --bind lan --port "$PHICLAW_CONTAINER_PORT"

    if [[ $? -ne 0 ]]; then
        die "Impossible de lancer le container"
    fi

    log INFO "Container lancé"
}

# Attend que le gateway soit prêt (HTTP 200)
wait_gateway() {
    log STEP "═══ Étape 10/15 : Attente du démarrage du gateway ═══"

    if [[ "$DRY_RUN" == true ]]; then
        log INFO "[DRY-RUN] Attendrait HTTP 200 sur le port ${PHICLAW_HOST_PORT}"
        return 0
    fi

    local url="http://127.0.0.1:${PHICLAW_HOST_PORT}/healthz"
    local elapsed=0
    local interval=3

    log INFO "Attente de HTTP 200 sur ${url} (timeout: ${PHICLAW_HEALTH_TIMEOUT}s)..."

    while [[ $elapsed -lt $PHICLAW_HEALTH_TIMEOUT ]]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            log INFO "✅ Gateway prêt après ${elapsed}s"
            return 0
        fi
        sleep "$interval"
        elapsed=$((elapsed + interval))
        if (( elapsed % 15 == 0 )); then
            log INFO "  ... en attente (${elapsed}/${PHICLAW_HEALTH_TIMEOUT}s)"
        fi
    done

    log ERROR "Gateway non prêt après ${PHICLAW_HEALTH_TIMEOUT}s"
    return 1
}

# Vérifie que Telegram est connecté
check_telegram() {
    log STEP "═══ Étape 11/15 : Vérification de Telegram ═══"

    if [[ "$DRY_RUN" == true ]]; then
        log INFO "[DRY-RUN] Vérifierait la connexion Telegram dans les logs"
        return 0
    fi

    local elapsed=0
    local interval=5

    log INFO "Vérification de la connexion Telegram (timeout: ${PHICLAW_TELEGRAM_TIMEOUT}s)..."

    while [[ $elapsed -lt $PHICLAW_TELEGRAM_TIMEOUT ]]; do
        local logs
        logs="$(docker logs "$PHICLAW_CONTAINER" 2>&1 | tail -50)"

        # Chercher des indicateurs de connexion Telegram
        if echo "$logs" | grep -qi "telegram.*connect\|telegram.*ready\|telegram.*start\|polling.*telegram\|bot.*started\|telegram.*running"; then
            log INFO "✅ Telegram connecté"
            return 0
        fi

        # Vérifier les erreurs Telegram
        if echo "$logs" | grep -qi "telegram.*error\|telegram.*fail\|telegram.*unauthorized"; then
            log WARN "⚠ Erreur Telegram détectée dans les logs"
            echo "$logs" | grep -i "telegram" | tail -3 | while read -r line; do
                log WARN "  ${line}"
            done
            return 1
        fi

        sleep "$interval"
        elapsed=$((elapsed + interval))
    done

    log WARN "⚠ Impossible de confirmer la connexion Telegram (timeout ${PHICLAW_TELEGRAM_TIMEOUT}s)"
    log WARN "  Le container tourne — Telegram se connectera peut-être plus tard"
    return 0  # Non-fatal : le gateway peut tourner sans Telegram temporairement
}

# Vérifie QMD
check_qmd() {
    log STEP "═══ Étape 12/15 : Vérification de QMD ═══"

    if [[ "$DRY_RUN" == true ]]; then
        log INFO "[DRY-RUN] Vérifierait QMD"
        return 0
    fi

    # Exécuter check-qmd.sh dans le container
    log INFO "Vérification de QMD dans le container..."
    local qmd_output
    if qmd_output=$(docker exec "$PHICLAW_CONTAINER" bash /app/scripts/check-qmd.sh 2>&1); then
        log INFO "✅ QMD fonctionnel"
        if [[ -n "$qmd_output" ]]; then
            echo "$qmd_output" | head -5 | while read -r line; do
                log INFO "  ${line}"
            done
        fi
        return 0
    else
        log WARN "⚠ QMD check retourné une erreur (non-fatal)"
        if [[ -n "$qmd_output" ]]; then
            echo "$qmd_output" | head -5 | while read -r line; do
                log WARN "  ${line}"
            done
        fi
        return 0  # Non-fatal
    fi
}

# Vérifie que les agents sont chargés
check_agents() {
    log STEP "═══ Étape 13/15 : Vérification des agents ═══"

    if [[ "$DRY_RUN" == true ]]; then
        log INFO "[DRY-RUN] Vérifierait les agents"
        return 0
    fi

    log INFO "Vérification des agents dans le container..."

    # Compter les agents
    local agent_count
    agent_count=$(docker exec "$PHICLAW_CONTAINER" bash -c 'ls /app/agents/*.md 2>/dev/null | wc -l' 2>/dev/null || echo "0")

    if [[ "$agent_count" -gt 0 ]]; then
        log INFO "✅ ${agent_count} agents trouvés dans /app/agents/"
        return 0
    else
        # Essayer un chemin alternatif
        agent_count=$(docker exec "$PHICLAW_CONTAINER" bash -c 'find /app/agents/ -name "*.md" 2>/dev/null | wc -l' 2>/dev/null || echo "0")
        if [[ "$agent_count" -gt 0 ]]; then
            log INFO "✅ ${agent_count} agents trouvés dans /app/agents/"
            return 0
        fi
        log WARN "⚠ Aucun agent trouvé dans /app/agents/ — vérifier le Dockerfile"
        return 1
    fi
}

# Log de succès
log_success() {
    log STEP "═══ Étape 14/15 : Résumé ═══"

    local new_commit
    new_commit="$(cd "$PHICLAW_REPO_DIR" && git rev-parse --short HEAD)"
    local image_id
    image_id="$(docker image inspect "$PHICLAW_IMAGE" --format '{{.ID}}' 2>/dev/null | cut -d: -f2 | head -c 12)"

    echo ""
    log INFO "╔═══════════════════════════════════════════════════╗"
    log INFO "║       🎉 PhiClaw mis à jour avec succès !        ║"
    log INFO "╠═══════════════════════════════════════════════════╣"
    log INFO "║  Commit  : ${new_commit}                              ║"
    log INFO "║  Image   : ${PHICLAW_IMAGE} (${image_id:-unknown})     ║"
    log INFO "║  Port    : ${PHICLAW_HOST_PORT}                              ║"
    log INFO "║  Logs    : ${PHICLAW_LOG_FILE}"
    log INFO "╚═══════════════════════════════════════════════════╝"
    echo ""

    notify "✅ PhiClaw mis à jour — commit ${new_commit}, image ${image_id:-unknown}" "success"
}

# Rollback complet en cas d'échec
rollback() {
    log STEP "═══ Étape 15/15 : ROLLBACK ═══"
    log ERROR "Échec détecté — lancement du rollback..."

    # 1. Vérifier si on a une image rollback
    if docker image inspect "phiclaw:rollback" >/dev/null 2>&1; then
        log INFO "Image phiclaw:rollback trouvée — restauration..."

        # Stop le container actuel (s'il tourne)
        docker stop "$PHICLAW_CONTAINER" 2>/dev/null || true
        docker rm "$PHICLAW_CONTAINER" 2>/dev/null || true

        # Restaurer l'image
        docker tag "phiclaw:rollback" "$PHICLAW_IMAGE"

        # Relancer avec l'ancienne image
        docker run --rm -v "${PHICLAW_CONFIG_VOLUME}:/data" alpine chown -R 1000:1000 /data 2>/dev/null || true
        docker run -d \
            --name "$PHICLAW_CONTAINER" \
            -p "${PHICLAW_HOST_PORT}:${PHICLAW_CONTAINER_PORT}" \
            -v "${PHICLAW_CONFIG_VOLUME}:/home/node/.openclaw" \
            -v "${PHICLAW_WORKSPACE_VOLUME}:/home/node/.openclaw/workspace" \
            --restart unless-stopped \
            "$PHICLAW_IMAGE" \
            gateway --bind lan --port "$PHICLAW_CONTAINER_PORT"

        log INFO "Container rollbacké avec l'ancienne image"
    else
        log ERROR "Pas d'image phiclaw:rollback disponible — rollback impossible"
    fi

    # 2. Rollback git si nécessaire
    if [[ -n "${MERGE_ROLLBACK_COMMIT:-}" ]]; then
        log INFO "Rollback du commit git à ${MERGE_ROLLBACK_COMMIT:0:12}..."
        cd "$PHICLAW_REPO_DIR"
        git reset --hard "$MERGE_ROLLBACK_COMMIT"
        git push origin main --force 2>/dev/null || log WARN "Impossible de force-push le rollback git"
    fi

    notify "🔄 ROLLBACK effectué — PhiClaw restauré à la version précédente" "rollback"
    die "Rollback terminé. Intervention manuelle peut être nécessaire."
}

# ─── Main ───────────────────────────────────────────────────────────
main() {
    echo ""
    log INFO "╔═══════════════════════════════════════════════════╗"
    log INFO "║       🔄 PhiClaw Auto-Updater                    ║"
    log INFO "║       $(date '+%Y-%m-%d %H:%M:%S')                        ║"
    log INFO "╚═══════════════════════════════════════════════════╝"
    echo ""

    if [[ "$DRY_RUN" == true ]]; then
        log WARN "⚡ Mode DRY-RUN — aucune modification ne sera appliquée"
        echo ""
    fi

    # Étape 1 : BuildKit
    ensure_buildx

    # Étape 2 : Remote upstream
    ensure_upstream

    # Étape 3 : Fetch
    fetch_upstream

    # Étape 4 : Comparer
    if ! check_updates; then
        exit 0
    fi

    # Étape 5 : Merge
    merge_upstream

    # Étape 6 : Push
    push_changes

    # Étape 7 : Build
    build_image

    # Étapes 8-13 : Deploy et vérifications
    local deploy_failed=false

    stop_container

    deploy_container

    if ! wait_gateway; then
        deploy_failed=true
    fi

    if [[ "$deploy_failed" == false ]]; then
        check_telegram || true  # Non-fatal
        check_qmd || true       # Non-fatal

        if ! check_agents; then
            log WARN "Agents non trouvés — le deployment continue mais vérifiez manuellement"
        fi
    fi

    # Étape 14-15 : Succès ou Rollback
    if [[ "$deploy_failed" == true ]]; then
        rollback
    else
        log_success
    fi
}

# Trap pour rollback en cas d'erreur non gérée
trap 'log ERROR "Erreur inattendue à la ligne $LINENO"; rollback' ERR

# Lancement
main "$@"
