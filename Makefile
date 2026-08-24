.PHONY: help install data match eval agent explain bench test docker clean

help:
	@echo "ReconMint - common commands"
	@echo "  make install   install python deps"
	@echo "  make data      generate synthetic dataset (520 records + answer key)"
	@echo "  make match     run the reconciliation engine (exact + fuzzy)"
	@echo "  make eval      score vs answer key -> metrics + eval_results.json"
	@echo "  make agent     run the agent loop -> SQLite audit trail"
	@echo "  make explain   run agent WITH the LLM explainer (needs OPENAI_API_KEY)"
	@echo "  make bench     performance benchmark (500 / 2000 / 10000 records)"
	@echo "  make test      run the test suite"
	@echo "  make docker    build and run via docker-compose"

install:
	pip install -r requirements.txt

data:
	python backend/generator/generate.py

match:
	python scripts/run_match.py

eval:
	python scripts/run_eval.py

agent:
	python scripts/run_agent.py

explain:
	python scripts/run_explain.py 12

bench:
	python scripts/benchmark.py

test:
	python -m pytest -q || python tests/test_verifier.py

docker:
	docker compose up --build

clean:
	rm -f data/audit.db data/eval_results.json
	rm -rf data/generated
