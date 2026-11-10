{
  description = "samsung: self-hosted Samsung EHS heat pump monitor (dev shell)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            # TypeScript toolchain
            nodejs_22
            pnpm

            # Local database
            postgresql_17

            # Kubernetes / GitOps
            kubectl
            kustomize
            fluxcd
            kubeconform
            sops
            age

            # Container images
            skopeo

            # Misc
            jq
            yq-go
            just
          ];

          shellHook = ''
            export PGDATA="$PWD/.direnv/postgres"
            export PGHOST="$PWD/.direnv"
            export PGPORT="''${PGPORT:-5432}"
          '';
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);
    };
}
